import type { PreferencesWorkflow } from '@/application/workflows/preferences';
import { type RestoredSettings, saveSettingsCommandSchema } from '@/shared/settings-contract';
import type { WorkflowResult } from '@/shared/workflow-contract';

import type { MainContext } from '../context';
import { handle, ignoredPayloadSchema } from './handle';
import { remember, saveChosen } from './preferences-state';
import { ok } from './result';

/**
 * Loading and saving renderer preferences. A legacy output folder is retained only as the next
 * native Save dialog's suggested location. `workflows` is
 * passed separately from the shared context: it is guaranteed constructed by the time this is
 * called, unlike the context's own optional `preferences` field (kept for the handlers that may
 * run before or without it, such as remembering a picker folder).
 */
export function registerSettingsHandlers(
  context: Pick<
    MainContext,
    'currentPreferences' | 'lastSaveFolder' | 'lastPickerFolder' | 'preferredNetworkInterface'
  >,
  workflows: PreferencesWorkflow,
): void {
  handle(
    'settings:load',
    ignoredPayloadSchema,
    async (): Promise<WorkflowResult<RestoredSettings>> => {
      const restored = await workflows.restore();
      remember(context, restored);
      return ok({
        preferences: restored.preferences,
        ...(restored.preferredNetworkInterface === undefined
          ? {}
          : { preferredNetworkInterface: restored.preferredNetworkInterface }),
        notices: restored.notices,
      });
    },
  );
  handle(
    'settings:save',
    saveSettingsCommandSchema,
    async (_event, command): Promise<WorkflowResult<undefined>> => {
      await saveChosen(context, workflows, command);
      return ok(undefined);
    },
  );
}
