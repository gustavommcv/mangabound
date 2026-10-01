import { describe, expect, it } from 'vitest';
import { ConversionWorkflow } from '@/application/workflows/conversion-workflow';

import {
  dependencies,
  folder,
  cbz,
  library,
  libraryRead,
  openLibrary,
} from './support/conversion-workflow';

describe('the author and language kept with a folder', () => {
  function workflowFor(ports: ReturnType<typeof dependencies>) {
    let id = 0;
    return new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => `id-${String(++id)}`,
      ports.bookFiles,
    );
  }
  const kept = { author: 'Fujimoto Tatsuki', language: 'pt-br' };

  describe('are read when a folder is', () => {
    it('told with the folder, when it holds any', async () => {
      const ports = dependencies();
      ports.readDetails.mockResolvedValue(kept);

      const inspected = await workflowFor(ports).inspect(folder);

      expect(ports.readDetails).toHaveBeenCalledExactlyOnceWith('/input/Trusted Manga');
      expect(inspected.details).toEqual(kept);
    });

    it('left out of what is told when the folder holds none, and never asked of a loose CBZ', async () => {
      const ports = dependencies();
      const workflow = workflowFor(ports);

      const read = await workflow.inspect(folder);
      const direct = await workflow.inspect(cbz);

      expect(read).not.toHaveProperty('details');
      expect(direct).not.toHaveProperty('details');
      expect(ports.readDetails).toHaveBeenCalledTimes(1);
    });

    it('told with each title of a library, and again when the library is read again', async () => {
      const ports = dependencies();
      ports.readDetails.mockImplementation((inputPath) =>
        Promise.resolve(inputPath === '/library/Good Manga' ? kept : {}),
      );
      const { workflow, sessionId } = await openLibrary(ports);

      const first = await workflow.planLibrary(sessionId);

      expect(first.titles.map((title) => [title.title, title.details])).toEqual([
        ['Good Manga', kept],
      ]);
      expect(ports.readDetails).toHaveBeenCalledWith('/library/Good Manga');
    });

    it('told with the titles of a library the first time it is opened', async () => {
      const ports = dependencies();
      ports.readDetails.mockResolvedValue(kept);
      ports.inspect.mockResolvedValue({
        workspaceId: 'workspace-1',
        draft: libraryRead,
        issues: [],
      });
      const workflow = workflowFor(ports);

      const inspected = await workflow.inspect(library);

      expect(inspected.kind).toBe('library');
      expect(inspected.titles?.map((title) => title.details)).toEqual([kept]);
      // The library itself is not a folder that keeps details, only its titles are.
      expect(ports.readDetails).not.toHaveBeenCalledWith('/input/Library');
    });
  });

  describe('are kept when asked', () => {
    it('with the folder of an input', async () => {
      const ports = dependencies();
      const workflow = workflowFor(ports);
      const inspected = await workflow.inspect(folder);

      await workflow.saveDetails(inspected.sessionId, kept);

      expect(ports.writeDetails).toHaveBeenCalledExactlyOnceWith('/input/Trusted Manga', kept);
    });

    it('with the folder of a title of a library, found in what was read', async () => {
      const ports = dependencies();
      const { workflow, sessionId } = await openLibrary(ports);

      await workflow.saveDetails(sessionId, kept, 'Good Manga');

      expect(ports.writeDetails).toHaveBeenCalledExactlyOnceWith('/library/Good Manga', kept);
    });

    it('never for something that is not there or that keeps none', async () => {
      const ports = dependencies();
      const workflow = workflowFor(ports);
      const direct = await workflow.inspect(cbz);
      const inspected = await workflow.inspect(folder);
      const { workflow: libraryWorkflow, sessionId } = await openLibrary(dependencies());

      await expect(workflow.saveDetails('gone', kept)).rejects.toMatchObject({
        code: 'session_not_found',
      });
      await expect(workflow.saveDetails(direct.sessionId, kept)).rejects.toMatchObject({
        code: 'unsupported_mode',
      });
      await expect(
        workflow.saveDetails(inspected.sessionId, kept, 'Good Manga'),
      ).rejects.toMatchObject({
        code: 'not_a_library',
      });
      await expect(libraryWorkflow.saveDetails(sessionId, kept)).rejects.toMatchObject({
        code: 'unsupported_mode',
      });
      await expect(libraryWorkflow.saveDetails(sessionId, kept, 'Not There')).rejects.toMatchObject(
        {
          code: 'title_not_found',
        },
      );
      expect(ports.writeDetails).not.toHaveBeenCalled();
    });

    it('and a failure to keep them is passed on as it is', async () => {
      const ports = dependencies();
      const failure = new Error('read only');
      ports.writeDetails.mockRejectedValue(failure);
      const workflow = workflowFor(ports);
      const inspected = await workflow.inspect(folder);

      await expect(workflow.saveDetails(inspected.sessionId, kept)).rejects.toBe(failure);
    });
  });
});
