import type { InputSelection } from '@/domain/conversion';
import type { WorkflowResult } from '@/shared/workflow-contract';

import { failed, ok } from './result';

/**
 * Inspects what a selection id stands for, once. The page holds the id and never the path, and an
 * id can be used a single time: it is spent whether or not the inspection worked, so one that was
 * seen can be neither replayed to read the same input again nor kept to be used later.
 */
export async function inspectOnce<Inspected>(
  selections: Map<string, InputSelection>,
  selectionId: string,
  inspect: (selection: InputSelection) => Promise<Inspected>,
): Promise<WorkflowResult<Inspected>> {
  const selection = selections.get(selectionId);
  if (selection === undefined) {
    return failed({ code: 'selection_not_found', message: 'Choose the input again.' });
  }
  try {
    return ok(await inspect(selection));
  } finally {
    selections.delete(selectionId);
  }
}
