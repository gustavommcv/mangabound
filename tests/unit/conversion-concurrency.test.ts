import { describe, expect, it } from 'vitest';

import { conversionConcurrency } from '@/application/workflows/conversion-concurrency';

describe('conversion concurrency', () => {
  it('keeps small machines at one worker', () => {
    expect(conversionConcurrency(4, 4 * 1024 ** 3)).toBe(1);
    expect(conversionConcurrency(2, 32 * 1024 ** 3)).toBe(1);
    expect(conversionConcurrency(12, 2 * 1024 ** 3)).toBe(1);
  });

  it('uses at most three workers when processors and memory allow it', () => {
    expect(conversionConcurrency(8, 8 * 1024 ** 3)).toBe(2);
    expect(conversionConcurrency(12, 32 * 1024 ** 3)).toBe(3);
    expect(conversionConcurrency(64, 128 * 1024 ** 3)).toBe(3);
  });
});
