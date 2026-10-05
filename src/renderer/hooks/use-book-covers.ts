import { useEffect, useState } from 'react';

import type { AttachedCover, CoverSlot } from '@/domain/book-covers';
import type { BookCoverControls } from '@/renderer/components/details/book-covers';
import type { MangaboundBridge } from '@/shared/runtime-info';
import type { CoversChange, CoverTarget, WorkflowResult } from '@/shared/workflow-contract';

interface CoverState {
  readonly key: string;
  readonly attached: readonly AttachedCover[];
  readonly note?: string;
}

const keyOf = (target: CoverTarget): string => `${target.sessionId}\n${target.title ?? ''}`;

/**
 * The covers of the item whose details are open: read when the page opens, and replaced by what
 * each change answers with. A change that fails is said and leaves the covers as they were.
 * `notify` is a dependency of the read, so pass a stable function (a `useCallback`).
 */
export function useBookCovers(
  bridge: Pick<
    MangaboundBridge,
    'listCovers' | 'chooseCover' | 'chooseCoversFolder' | 'dropCovers' | 'removeCover'
  >,
  target: CoverTarget | undefined,
  slots: readonly CoverSlot[],
  notify: (message: string) => void,
): BookCoverControls | undefined {
  const key = target === undefined ? undefined : keyOf(target);
  const [state, setState] = useState<CoverState>();
  // The target is a new object on every render: what names the item is these two values.
  const sessionId = target?.sessionId;
  const title = target?.title;

  useEffect(() => {
    if (sessionId === undefined) return;
    const item: CoverTarget = title === undefined ? { sessionId } : { sessionId, title };
    const itemKey = keyOf(item);
    let current = true;
    void bridge.listCovers(item).then((result) => {
      if (!current) return;
      if (result.ok) setState({ key: itemKey, attached: result.value });
      else notify(result.error.message);
    });
    return () => {
      current = false;
    };
  }, [bridge, sessionId, title, notify]);

  if (target === undefined || key === undefined) return undefined;

  const apply = (result: WorkflowResult<CoversChange | null>): void => {
    if (!result.ok) {
      notify(result.error.message);
      return;
    }
    // Nothing was picked in the dialog: the covers are as they were.
    if (result.value === null) return;
    setState({
      key,
      attached: result.value.covers,
      ...(result.value.note === undefined ? {} : { note: result.value.note }),
    });
  };
  // What is shown belongs to the item that is open; another item's covers are never shown as its.
  const shown = state?.key === key ? state : undefined;

  return {
    attached: shown?.attached ?? [],
    ...(shown?.note === undefined ? {} : { note: shown.note }),
    onChoose: (slot) => {
      void bridge.chooseCover({ ...target, slot }).then(apply);
    },
    onRemove: (slot) => {
      void bridge.removeCover({ ...target, slot }).then(apply);
    },
    onChooseFolder: () => {
      void bridge.chooseCoversFolder({ ...target, slots }).then(apply);
    },
    onDropFiles: (slot, files) => {
      void bridge
        .dropCovers({ ...target, slots, ...(slot === undefined ? {} : { slot }) }, files)
        .then(apply);
    },
  };
}
