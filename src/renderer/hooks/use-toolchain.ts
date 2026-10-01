import { useEffect, useState } from 'react';

import type { MangaboundBridge } from '@/shared/runtime-info';
import type { ToolchainStatus } from '@/shared/toolchain-status';
import type { DeviceProfileSummary, WorkflowFailure } from '@/shared/workflow-contract';

/**
 * The status of the bundled tools and, once they are ready, the devices they can convert for. Both
 * are read once per bridge, and nothing that arrives after the component is gone is used.
 *
 * `onFailure` is told when the list of devices could not be read. A different one starts the lookup
 * again, so pass a stable function (a state setter).
 */
export function useToolchain(
  bridge: MangaboundBridge,
  onFailure: (failure: WorkflowFailure) => void,
): {
  readonly toolchain: ToolchainStatus | undefined;
  readonly profiles: readonly DeviceProfileSummary[];
} {
  const [toolchain, setToolchain] = useState<ToolchainStatus>();
  const [profiles, setProfiles] = useState<readonly DeviceProfileSummary[]>([]);

  useEffect(() => {
    let current = true;
    // Asked again after an await, where the flag may have been cleared meanwhile.
    const isStale = (): boolean => !current;
    void bridge
      .getToolchainStatus()
      .then(async (status) => {
        if (isStale()) return;
        setToolchain(status);
        if (status.state !== 'ready') return;
        const result = await bridge.getDeviceProfiles();
        if (isStale()) return;
        if (result.ok) setProfiles(result.value);
        else onFailure(result.error);
      })
      .catch(() => {
        if (current) {
          setToolchain({
            state: 'blocked',
            tools: [],
            message: 'The bundled conversion tools could not be checked.',
          });
        }
      });
    return () => {
      current = false;
    };
  }, [bridge, onFailure]);

  return { toolchain, profiles };
}
