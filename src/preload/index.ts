import { contextBridge, ipcRenderer } from 'electron';

import type { MangaboundBridge } from '../shared/runtime-info';
import type { ToolchainStatus } from '../shared/toolchain-status';

const bridge: MangaboundBridge = Object.freeze({
  getToolchainStatus: async () => {
    const status: unknown = await ipcRenderer.invoke('toolchain:get-status');
    return status as ToolchainStatus;
  },
  runtime: Object.freeze({
    electron: process.versions.electron,
    platform: process.platform,
  }),
});

contextBridge.exposeInMainWorld('mangabound', bridge);
