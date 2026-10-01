import { useCallback, useEffect, useState } from 'react';

import type {
  NetworkInterfaceOption,
  OpdsAuthConfig,
  OpdsSharingStatus,
} from '@/shared/opds-contract';
import type { MangaboundBridge } from '@/shared/runtime-info';
import type { SelectedLibrary, WorkflowFailure } from '@/shared/workflow-contract';

/**
 * What the Share panel needs: whether it is open, the folder it would share, the network
 * addresses to share on, whether sharing is running, and the three things a person does there
 * (choose the folder, start, stop). The addresses and the status are read once per bridge. A
 * refusal is told to `onFailure`, which is a dependency of the actions, so pass a stable function
 * (a state setter).
 */
export function useSharing(
  bridge: MangaboundBridge,
  onFailure: (failure: WorkflowFailure) => void,
): {
  readonly panelOpen: boolean;
  readonly setPanelOpen: (open: boolean) => void;
  readonly library: SelectedLibrary | undefined;
  readonly interfaces: readonly NetworkInterfaceOption[];
  readonly status: OpdsSharingStatus;
  /** Asks for a folder to share; a cancelled dialog changes nothing. */
  readonly chooseLibrary: () => Promise<void>;
  /** Starts sharing the chosen folder on an address; nothing happens until a folder is chosen. */
  readonly start: (interfaceAddress: string, auth: OpdsAuthConfig) => Promise<void>;
  readonly stop: () => Promise<void>;
  /**
   * Opens the panel with these books chosen. Sharing that is already running keeps serving what it
   * serves: changing it is what stopping is for.
   */
  readonly shareBooks: (books: SelectedLibrary) => void;
  /** Lets go of the chosen folder when it is the one that was deleted. */
  readonly forgetLibrary: (libraryId: string) => void;
} {
  const [panelOpen, setPanelOpen] = useState(false);
  const [library, setLibrary] = useState<SelectedLibrary>();
  const [interfaces, setInterfaces] = useState<readonly NetworkInterfaceOption[]>([]);
  const [status, setStatus] = useState<OpdsSharingStatus>({ active: false });

  useEffect(() => {
    let current = true;
    void Promise.all([bridge.listNetworkInterfaces(), bridge.getSharingStatus()]).then(
      ([interfacesResult, statusResult]) => {
        if (!current) return;
        if (interfacesResult.ok) setInterfaces(interfacesResult.value);
        if (statusResult.ok) setStatus(statusResult.value);
      },
    );
    return () => {
      current = false;
    };
  }, [bridge]);

  const chooseLibrary = useCallback(async (): Promise<void> => {
    const result = await bridge.chooseLibrary();
    if (!result.ok) onFailure(result.error);
    else if (result.value !== null) setLibrary(result.value);
  }, [bridge, onFailure]);

  const start = useCallback(
    async (interfaceAddress: string, auth: OpdsAuthConfig): Promise<void> => {
      if (library === undefined) return;
      const result = await bridge.startSharing(library.libraryId, interfaceAddress, auth);
      if (!result.ok) onFailure(result.error);
      else setStatus(result.value);
    },
    [bridge, library, onFailure],
  );

  const stop = useCallback(async (): Promise<void> => {
    const result = await bridge.stopSharing();
    if (!result.ok) onFailure(result.error);
    else setStatus({ active: false });
  }, [bridge, onFailure]);

  const shareBooks = useCallback(
    (books: SelectedLibrary): void => {
      if (!status.active) setLibrary(books);
      setPanelOpen(true);
    },
    [status.active],
  );

  const forgetLibrary = useCallback((libraryId: string): void => {
    setLibrary((current) => (current?.libraryId === libraryId ? undefined : current));
  }, []);

  return {
    panelOpen,
    setPanelOpen,
    library,
    interfaces,
    status,
    chooseLibrary,
    start,
    stop,
    shareBooks,
    forgetLibrary,
  };
}
