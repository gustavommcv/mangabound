import { describe, expect, it } from 'vitest';

import { cn } from '@/renderer/lib/utils';

describe('class-name composition', () => {
  it('keeps conditional classes and resolves conflicting Tailwind utilities', () => {
    expect(cn('px-2 text-sm', undefined, ['px-4', 'font-medium'])).toBe('text-sm px-4 font-medium');
  });
});
