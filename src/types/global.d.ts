import type { MangaboundBridge } from '../shared/runtime-info';

declare global {
  interface Window {
    readonly mangabound: MangaboundBridge;
  }
}

export {};
