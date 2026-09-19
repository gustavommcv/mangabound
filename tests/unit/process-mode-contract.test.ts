import { describe, expect, it } from 'vitest';

import { defaultMangapressSettings } from '@/domain/output-profile';
import { processModes } from '@/domain/process-mode';
import { batchConversionCommandSchema, conversionCommandSchema } from '@/shared/workflow-contract';

const single = {
  jobId: 'job-1',
  sessionId: 'session-1',
  libraryId: 'library-1',
  settings: defaultMangapressSettings,
  format: 'epub',
} as const;

const batch = {
  jobId: 'job-1',
  parentPath: 'C:\\Library',
  libraryId: 'library-1',
  settings: defaultMangapressSettings,
  format: 'epub',
} as const;

describe('process mode on the IPC commands', () => {
  it('accepts every mode for one input, and none at all as the ordinary run', () => {
    for (const mode of processModes) {
      expect(conversionCommandSchema.parse({ ...single, mode }).mode).toBe(mode);
    }
    expect(conversionCommandSchema.parse(single).mode).toBeUndefined();
  });

  it('rejects a mode nobody defined', () => {
    expect(conversionCommandSchema.safeParse({ ...single, mode: 'skip-everything' }).success).toBe(
      false,
    );
    expect(batchConversionCommandSchema.safeParse({ ...batch, mode: 'nothing' }).success).toBe(
      false,
    );
  });

  it('lets a batch join or join-and-convert, but never skip the joining', () => {
    expect(batchConversionCommandSchema.parse({ ...batch, mode: 'bind-only' }).mode).toBe(
      'bind-only',
    );
    expect(batchConversionCommandSchema.parse({ ...batch, mode: 'bind-and-convert' }).mode).toBe(
      'bind-and-convert',
    );
    expect(batchConversionCommandSchema.parse(batch).mode).toBeUndefined();
    expect(batchConversionCommandSchema.safeParse({ ...batch, mode: 'convert-only' }).success).toBe(
      false,
    );
  });
});
