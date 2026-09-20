import '@testing-library/jest-dom/vitest';

import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom has no ResizeObserver, which the menus' positioning (Radix's popper) measures with. Nothing
// here depends on the sizes it would report, so an observer that observes nothing is enough.
class SilentResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= SilentResizeObserver;

afterEach(() => {
  cleanup();
});
