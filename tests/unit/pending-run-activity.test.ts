import { describe, expect, it } from 'vitest';

import { PendingRunActivity } from '@/main/pending-run-activity';

describe('pending run activity', () => {
  it('waits for every overlapping export before allowing deletion', () => {
    const activity = new PendingRunActivity();
    const finishFirst = activity.beginExport('run');
    const finishSecond = activity.beginExport('run');
    expect(finishFirst).toBeDefined();
    expect(finishSecond).toBeDefined();
    expect(activity.beginDelete('run')).toBeUndefined();
    finishFirst?.();
    expect(activity.beginDelete('run')).toBeUndefined();
    finishSecond?.();

    const finishDelete = activity.beginDelete('run');
    expect(finishDelete).toBeDefined();
    expect(activity.isDeleting('run')).toBe(true);
    expect(activity.beginExport('run')).toBeUndefined();
    expect(activity.beginDelete('run')).toBeUndefined();
    expect(activity.beginExport('another-run')).toBeDefined();
    finishDelete?.();
    expect(activity.isDeleting('run')).toBe(false);
    expect(activity.beginExport('run')).toBeDefined();
  });
});
