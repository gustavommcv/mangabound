import { describe, expect, it } from 'vitest';

import { presentBindingProgress } from '@/application/workflows/binding-progress';

describe('binding progress presentation', () => {
  it('keeps inspection messages distinct from archive writing', () => {
    expect(presentBindingProgress({ stage: 'inspect', state: 'started', manga: 'A Work' })).toEqual(
      {
        stage: 'binding',
        title: 'A Work',
        message: 'Inspecting A Work…',
      },
    );
    expect(
      presentBindingProgress({ stage: 'inspect', state: 'completed', manga: 'A Work' }),
    ).toEqual({
      stage: 'binding',
      title: 'A Work',
      message: 'Organizing chapters for A Work…',
    });
  });

  it('keeps the write label stable while reporting copied pages and archive completion', () => {
    const base = {
      stage: 'write' as const,
      manga: 'A Work',
      volumeIndex: 2,
      volumeCount: 3,
      totalPages: 10,
    };
    expect(presentBindingProgress({ ...base, state: 'started', completedPages: 4 })).toMatchObject({
      message: 'Building volume 2 of 3…',
      bindingState: 'started',
      completed: 4,
      total: 10,
    });
    expect(presentBindingProgress({ ...base, state: 'advanced', completedPages: 9 })).toMatchObject(
      {
        message: 'Building volume 2 of 3…',
        bindingState: 'advanced',
        completed: 9,
      },
    );
    expect(
      presentBindingProgress({ ...base, state: 'completed', completedPages: 10 }),
    ).toMatchObject({
      bindingState: 'completed',
      completed: 10,
    });
  });
});
