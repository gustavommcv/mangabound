import { describe, expect, it } from 'vitest';

import { defaultMangapressSettings } from '@/domain/output-profile';
import {
  chooseInputsKindSchema,
  conversionCommandSchema,
  registerInputsCommandSchema,
} from '@/shared/workflow-contract';

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

  it('accepts only the two kinds of native picker', () => {
    expect(chooseInputsKindSchema.safeParse('files').success).toBe(true);
    expect(chooseInputsKindSchema.safeParse('folders').success).toBe(true);
    expect(chooseInputsKindSchema.safeParse('library').success).toBe(false);
  });

  it('takes a bounded list of dropped paths, empty ones included', () => {
    expect(registerInputsCommandSchema.safeParse({ paths: ['C:\\a', ''] }).success).toBe(true);
    expect(registerInputsCommandSchema.safeParse({ paths: [] }).success).toBe(true);
    expect(registerInputsCommandSchema.safeParse({ paths: [1] }).success).toBe(false);
    expect(
      registerInputsCommandSchema.safeParse({ paths: Array.from({ length: 1001 }, () => 'x') })
        .success,
    ).toBe(false);
  });
});
