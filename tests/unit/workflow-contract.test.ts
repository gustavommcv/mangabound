import { describe, expect, it } from 'vitest';

import { defaultMangapressSettings } from '@/domain/output-profile';
import { conversionCommandSchema } from '@/shared/workflow-contract';

const command = {
  jobId: 'job',
  sessionId: 'session',
  libraryId: 'library',
  settings: defaultMangapressSettings,
  format: 'epub',
};

describe('workflow IPC contract', () => {
  it('accepts a complete output-settings command', () => {
    expect(conversionCommandSchema.safeParse(command).success).toBe(true);
  });

  it('rejects unsafe numeric ranges and incomplete custom resolutions', () => {
    expect(
      conversionCommandSchema.safeParse({
        ...command,
        settings: { ...defaultMangapressSettings, croppingMinimum: 101 },
      }).success,
    ).toBe(false);
    expect(
      conversionCommandSchema.safeParse({
        ...command,
        settings: { ...defaultMangapressSettings, deviceProfile: 'OTHER', customWidth: 1200 },
      }).success,
    ).toBe(false);
  });
});
