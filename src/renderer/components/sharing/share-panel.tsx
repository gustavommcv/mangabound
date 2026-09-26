import { Copy, RadioTower } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/renderer/components/ui/button';
import { Input } from '@/renderer/components/ui/input';
import { Label } from '@/renderer/components/ui/label';
import { NativeSelect } from '@/renderer/components/ui/native-select';
import { catalogAddress } from '@/renderer/lib/sharing';
import type {
  NetworkInterfaceOption,
  OpdsAuthConfig,
  OpdsSharingStatus,
} from '@/shared/opds-contract';
import type { SelectedLibrary } from '@/shared/workflow-contract';

export interface SharePanelProps {
  readonly library?: SelectedLibrary;
  readonly interfaces: readonly NetworkInterfaceOption[];
  readonly status: OpdsSharingStatus;
  readonly onChooseLibrary: () => void;
  readonly onStart: (interfaceAddress: string, auth: OpdsAuthConfig) => void;
  readonly onStop: () => void;
}

/**
 * The one place sharing is set up, started and stopped (ADR 0016). It opens from the title bar
 * whenever it is wanted, and from the results screen with the books just saved already chosen.
 */
export function SharePanel({
  library,
  interfaces,
  status,
  onChooseLibrary,
  onStart,
  onStop,
}: SharePanelProps): React.JSX.Element {
  const [interfaceAddress, setInterfaceAddress] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const shareUrlRef = useRef<HTMLInputElement>(null);
  // Always present and never disabled in the "not active" branch, unlike "Start sharing" (which
  // is disabled when no library or network interface is available) - the one safe universal
  // target for the stop transition, whatever its label ("Choose a library" / "Change shared
  // library") happens to say.
  const libraryButtonRef = useRef<HTMLButtonElement>(null);
  const previousActive = useRef(status.active);

  const selectedInterfaceAddress =
    interfaceAddress === '' ? (interfaces[0]?.address ?? '') : interfaceAddress;
  const canStart = library !== undefined && selectedInterfaceAddress !== '';
  const address = catalogAddress(status) ?? '';

  // Moves focus only on a genuine start/stop, never on mount - reopening the panel while sharing
  // is already active must not steal focus (share-menu.tsx already focuses the panel itself then).
  useEffect(() => {
    if (previousActive.current !== status.active) {
      if (status.active) shareUrlRef.current?.focus();
      else libraryButtonRef.current?.focus();
    }
    previousActive.current = status.active;
  }, [status.active]);

  return (
    <section
      aria-labelledby="share-title"
      className="border-border bg-surface rounded-xl border p-5"
    >
      <div className="flex items-center gap-2 pr-10">
        <RadioTower aria-hidden="true" className="text-accent size-4 shrink-0" />
        <h2 className="text-sm font-semibold" id="share-title">
          Share to your e-reader
        </h2>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        Serves a newest-first catalog on your network, so KOReader or any OPDS reader can browse and
        download what you&apos;ve converted.
      </p>

      {status.active ? (
        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="share-url">Catalog address</Label>
            <div className="mt-1.5 flex gap-2">
              <Input id="share-url" readOnly ref={shareUrlRef} value={address} />
              <Button
                aria-label="Copy the address"
                onClick={() => {
                  void navigator.clipboard.writeText(address).then(
                    () => {
                      setCopied(true);
                    },
                    () => {
                      setCopied(false);
                    },
                  );
                }}
                size="sm"
                variant="outline"
              >
                <Copy /> {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
          <p className="text-subtle-foreground text-xs">
            In KOReader: Search, then OPDS catalog, then add this address. Keep Mangabound open
            while it syncs.
          </p>
          <Button onClick={onStop} size="sm" variant="outline">
            Stop sharing
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <Button onClick={onChooseLibrary} ref={libraryButtonRef} size="sm" variant="outline">
              {library === undefined ? 'Choose a library to share' : 'Change shared library'}
            </Button>
            {library !== undefined && (
              <span className="text-muted-foreground truncate text-xs">{library.displayPath}</span>
            )}
          </div>

          {interfaces.length === 0 ? (
            <p className="text-muted-foreground text-xs">No network interfaces were detected.</p>
          ) : (
            <div>
              <Label htmlFor="share-interface">Network interface</Label>
              <NativeSelect
                id="share-interface"
                onChange={(event) => {
                  setInterfaceAddress(event.target.value);
                }}
                value={selectedInterfaceAddress}
              >
                {interfaces.map((option) => (
                  <option key={option.address} value={option.address}>
                    {option.name} ({option.address})
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="share-username">Username</Label>
              <Input
                id="share-username"
                onChange={(event) => {
                  setUsername(event.target.value);
                }}
                value={username}
              />
            </div>
            <div>
              <Label htmlFor="share-password">Password</Label>
              <Input
                id="share-password"
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
                type="password"
                value={password}
              />
            </div>
          </div>
          <p className="text-subtle-foreground text-xs">
            Leave both blank to share with no password.
          </p>

          <Button
            disabled={!canStart}
            onClick={() => {
              onStart(selectedInterfaceAddress, { username, password });
            }}
            size="sm"
          >
            Start sharing
          </Button>
        </div>
      )}
    </section>
  );
}
