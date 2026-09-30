import { describe, expect, it } from 'vitest';

import { assertSingleBook, validateRunOptions } from '@/application/workflows/run-preconditions';
import { ConversionWorkflowError } from '@/domain/conversion';
import { defaultMangapressSettings } from '@/domain/output-profile';

const options = { settings: defaultMangapressSettings, format: 'epub' } as const;

describe('shared run options', () => {
  it('defaults to binding and converting when no mode was chosen', () => {
    expect(validateRunOptions(options, 'converting')).toBe('bind-and-convert');
  });

  it.each(['bind-and-convert', 'bind-only', 'convert-only'] as const)(
    'keeps the explicitly chosen %s mode',
    (mode) => {
      expect(validateRunOptions({ ...options, mode }, 'converting')).toBe(mode);
    },
  );

  it.each(['converting', 'validating the plan'] as const)(
    'does not validate unused mangapress settings before %s',
    (action) => {
      expect(
        validateRunOptions(
          {
            ...options,
            mode: 'bind-only',
            settings: { ...defaultMangapressSettings, jpegQuality: 101 },
          },
          action,
        ),
      ).toBe('bind-only');
    },
  );

  it.each([
    { mode: 'bind-and-convert', action: 'converting' },
    { mode: 'convert-only', action: 'converting' },
    { mode: 'bind-and-convert', action: 'validating the plan' },
    { mode: 'convert-only', action: 'validating the plan' },
  ] as const)('rejects invalid settings for $mode before $action', ({ mode, action }) => {
    const run = () =>
      validateRunOptions(
        {
          ...options,
          mode,
          settings: { ...defaultMangapressSettings, jpegQuality: 101 },
        },
        action,
      );
    expect(run).toThrow(ConversionWorkflowError);
    expect(run).toThrowError(
      expect.objectContaining({
        code: 'invalid_settings',
        message: `Review the output settings before ${action}.`,
      }),
    );
  });
});

describe('shared single-book requirements', () => {
  it('allows a combined EPUB when both tools run', () => {
    expect(() => {
      assertSingleBook('bind-and-convert', 'epub');
    }).not.toThrow();
  });

  it.each(['bind-only', 'convert-only'] as const)(
    'rejects %s before checking the format',
    (mode) => {
      expect(() => {
        assertSingleBook(mode, 'pdf');
      }).toThrowError(
        expect.objectContaining({
          code: 'invalid_settings',
          message: 'Single book mode requires both binding and converting.',
        }),
      );
    },
  );

  it.each(['cbz', 'pdf'] as const)(
    'rejects a combined %s until that format is supported',
    (format) => {
      expect(() => {
        assertSingleBook('bind-and-convert', format);
      }).toThrowError(
        expect.objectContaining({
          code: 'invalid_settings',
          message: 'Binding the whole series as one volume is only available for EPUB right now.',
        }),
      );
    },
  );
});
