import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { browser } from '@wdio/globals';

const temporaryDirectories: string[] = [];

after(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

/**
 * What the packaged window lets its own page do. These are the things code that got into the page
 * (a flaw in the renderer, or in a library bundled with it) would try first: read a file, send it
 * out, switch on a microphone or a location, share the books on every network.
 */
describe('packaged window policy', () => {
  it('does not let the page read a local file', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'mangabound-window-policy-'));
    temporaryDirectories.push(directory);
    const secretPath = path.join(directory, 'secret.txt');
    await writeFile(secretPath, 'a-secret-the-page-must-not-read', 'utf8');

    const outcome = JSON.parse(
      await browser.execute(async (fileUrl: string) => {
        const attempts: Record<string, string> = {};
        try {
          attempts.fetch = `read: ${await (await fetch(fileUrl)).text()}`;
        } catch (error) {
          attempts.fetch = `refused: ${String(error)}`;
        }
        attempts.xhr = await new Promise<string>((resolve) => {
          const request = new XMLHttpRequest();
          request.onload = () => {
            resolve(`read: ${request.responseText}`);
          };
          request.onerror = () => {
            resolve('refused');
          };
          request.open('GET', fileUrl);
          request.send();
        });
        return JSON.stringify(attempts);
      }, pathToFileURL(secretPath).href),
    ) as Record<string, string>;

    assert.match(outcome.fetch ?? '', /^refused/u);
    assert.equal(outcome.xhr, 'refused');
  });

  it('does not let the page open a connection to another host', async () => {
    let connections = 0;
    const listener = net.createServer((socket) => {
      connections += 1;
      socket.destroy();
    });
    listener.listen(0, '127.0.0.1');
    await once(listener, 'listening');
    const { port } = listener.address() as net.AddressInfo;

    try {
      const outcome = JSON.parse(
        await browser.execute(
          async (host: string) => {
            const socketOpened = await new Promise<boolean>((resolve) => {
              const socket = new WebSocket(`ws://${host}/exfiltrate`);
              socket.onopen = () => {
                resolve(true);
              };
              socket.onerror = () => {
                resolve(false);
              };
              socket.onclose = () => {
                resolve(false);
              };
              setTimeout(() => {
                resolve(false);
              }, 3000);
            });
            let fetchReached = true;
            try {
              await fetch(`http://${host}/exfiltrate`, { mode: 'no-cors' });
            } catch {
              fetchReached = false;
            }
            return JSON.stringify({ socketOpened, fetchReached });
          },
          `127.0.0.1:${String(port)}`,
        ),
      ) as { socketOpened: boolean; fetchReached: boolean };

      assert.equal(outcome.socketOpened, false);
      assert.equal(outcome.fetchReached, false);
      // Nothing was even attempted on the wire: the page's own policy stopped it first.
      assert.equal(connections, 0);
    } finally {
      listener.close();
    }
  });

  it('refuses the camera, the microphone, the location and notifications, and keeps the clipboard', async () => {
    const outcome = JSON.parse(
      await browser.execute(async () => {
        const notification = await Notification.requestPermission();
        // Asking, not only querying: a request goes through a different door of the policy than
        // a query does. A machine with no microphone or camera answers NotFoundError to
        // getUserMedia before any permission is looked at, so those two are only queried; a
        // position request is refused (code 1) before anything asks for a position.
        const locationError = await new Promise<number>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => {
              resolve(0);
            },
            (error) => {
              resolve(error.code);
            },
            { timeout: 5000 },
          );
        });
        const state = async (name: string): Promise<string> =>
          (await navigator.permissions.query({ name: name as PermissionName })).state;
        return JSON.stringify({
          notification,
          locationError,
          microphone: await state('microphone'),
          camera: await state('camera'),
          geolocation: await state('geolocation'),
          notifications: await state('notifications'),
          clipboardWrite: await state('clipboard-write'),
        });
      }),
    ) as Record<string, string | number>;

    assert.equal(outcome.notification, 'denied');
    assert.equal(outcome.microphone, 'denied');
    assert.equal(outcome.locationError, 1);
    assert.equal(outcome.camera, 'denied');
    assert.equal(outcome.geolocation, 'denied');
    assert.equal(outcome.notifications, 'denied');
    assert.equal(outcome.clipboardWrite, 'granted');
  });

  it('does not start sharing on an address that is not one of the device’s own', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'mangabound-window-policy-'));
    temporaryDirectories.push(directory);
    const openDialog = await browser.electron.mock('dialog', 'showOpenDialog');
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [directory] });

    const outcomes = JSON.parse(
      await browser.execute(async () => {
        const bridge = window.mangabound;
        if (bridge === undefined) throw new Error('The app bridge is unavailable.');
        const chosen = await bridge.chooseLibrary();
        if (!chosen.ok || chosen.value === null) throw new Error('Could not choose a library.');
        const auth = { username: '', password: '' };
        const started = await Promise.all(
          ['0.0.0.0', '::', 'localhost', '203.0.113.7'].map((address) =>
            bridge.startSharing(chosen.value?.libraryId ?? '', address, auth),
          ),
        );
        return JSON.stringify({ started, status: await bridge.getSharingStatus() });
      }),
    ) as {
      started: { ok: boolean; error?: { code: string } }[];
      status: { ok: boolean; value?: { active: boolean } };
    };

    assert.equal(outcomes.started.length, 4);
    for (const result of outcomes.started) {
      assert.equal(result.ok, false);
      assert.equal(result.error?.code, 'sharing_address_unavailable');
    }
    assert.equal(outcomes.status.value?.active, false);
  });
});
