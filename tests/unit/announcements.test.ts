import { describe, expect, it } from 'vitest';

import type { ConversionProgress } from '@/domain/conversion';
import { isPageEvent, milestone } from '@/renderer/lib/announcements';

const page: ConversionProgress = {
  stage: 'processing',
  message: 'Processed page 3 of 50.',
  page: 3,
  completed: 3,
  total: 50,
};

describe('isPageEvent', () => {
  it('is a message about one page, with a percentage to go with it', () => {
    expect(isPageEvent(page, 6)).toBe(true);
  });

  it('is not a message about a stage or a volume, which has no page', () => {
    expect(
      isPageEvent({ ...page, page: undefined, message: '1 of 3 volumes converted.' }, 33),
    ).toBe(false);
  });

  it('is not one when there is no percentage to tell instead', () => {
    expect(isPageEvent(page, undefined)).toBe(false);
  });

  it('is not one before anything was reported', () => {
    expect(isPageEvent(undefined, undefined)).toBe(false);
    expect(isPageEvent(undefined, 50)).toBe(false);
  });
});

describe('milestone', () => {
  it.each([
    [0, '0% complete'],
    [9, '0% complete'],
    [10, '10% complete'],
    [59, '50% complete'],
    [99, '90% complete'],
    [100, '100% complete'],
  ])('tells %i%% as %s', (percentage, told) => {
    expect(milestone(percentage)).toBe(told);
  });
});
