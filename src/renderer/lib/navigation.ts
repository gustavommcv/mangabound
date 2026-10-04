import type { QueueRow } from '@/domain/input-queue';

/** What one of the screens about an item of the queue is about. */
export type EditingTarget =
  | { readonly kind: 'input'; readonly rowId: string }
  | { readonly kind: 'title'; readonly rowId: string; readonly title: string };

/** A screen and its target travel together; non-editing screens keep no stale selection. */
export type WorkflowNavigation =
  | { readonly screen: 'queue' | 'options' | 'running' | 'results' }
  | { readonly screen: 'library'; readonly rowId: string }
  | { readonly screen: 'mapping' | 'details'; readonly target: EditingTarget };

const queue: WorkflowNavigation = { screen: 'queue' };

/**
 * Where the window really is: the screen asked for, unless it is about an item of the queue that is
 * no longer there (removed, or the queue cleared) or no longer in the state the screen needs. Such
 * a screen has nothing to show, and would be a title bar with no heading and no way back, so the
 * queue is shown instead.
 */
export function resolveNavigation(
  navigation: WorkflowNavigation,
  rows: readonly QueueRow[],
): WorkflowNavigation {
  if (navigation.screen === 'library') {
    const row = rows.find((candidate) => candidate.id === navigation.rowId);
    return row?.state === 'inspected' && row.titles !== undefined ? navigation : queue;
  }
  if (navigation.screen === 'mapping' || navigation.screen === 'details') {
    const { target } = navigation;
    const row = rows.find((candidate) => candidate.id === target.rowId);
    if (row?.state !== 'inspected') return queue;
    if (
      target.kind === 'title' &&
      row.titles?.some((entry) => entry.title === target.title) !== true
    ) {
      return queue;
    }
  }
  return navigation;
}
