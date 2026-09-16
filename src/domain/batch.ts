import type { BookFormat, PipelineIssue } from './conversion';
import type { MappingDraft } from './mapping';

export type BatchTitleDiscoveryStatus = 'completed' | 'completed_with_warnings' | 'failed';

export interface BatchDiscoveredTitle {
  readonly title: string;
  readonly inputPath: string;
  readonly status: BatchTitleDiscoveryStatus;
  readonly draft: MappingDraft;
  readonly volumes: readonly {
    readonly name: string;
    readonly pageCount: number;
  }[];
  readonly issues: readonly PipelineIssue[];
}

export interface BatchDiscovery {
  readonly titles: readonly BatchDiscoveredTitle[];
  readonly issues: readonly PipelineIssue[];
}

export interface BatchArtifact {
  readonly id: string;
  readonly name: string;
  readonly bytes: number;
  readonly format: BookFormat;
}

export interface BatchFailure {
  readonly code: string;
  readonly message: string;
  readonly issue?: PipelineIssue;
}

export interface BatchTitleOutcome {
  readonly title: string;
  readonly status: 'done' | 'failed';
  readonly artifacts: readonly BatchArtifact[];
  readonly failure?: BatchFailure;
}

export type BatchTitleStatus = 'needsMapping' | 'ready' | 'converting' | 'done' | 'failed';

export interface BatchTitle {
  readonly title: string;
  readonly inputPath: string;
  readonly status: BatchTitleStatus;
  readonly draft: MappingDraft;
  readonly volumes: readonly {
    readonly name: string;
    readonly pageCount: number;
  }[];
  readonly issues: readonly PipelineIssue[];
  readonly artifacts?: readonly BatchArtifact[];
  readonly failure?: BatchFailure;
}

export interface BatchState {
  readonly titles: readonly BatchTitle[];
}

export function createBatchState(discovery: BatchDiscovery): BatchState {
  return {
    titles: discovery.titles.map((title) => ({
      title: title.title,
      inputPath: title.inputPath,
      status: title.volumes.length === 0 ? 'needsMapping' : 'ready',
      draft: title.draft,
      volumes: title.volumes,
      issues: title.issues,
    })),
  };
}

export function applyCorrectedMapping(
  state: BatchState,
  title: string,
  draft: MappingDraft,
): BatchState {
  return {
    titles: state.titles.map((candidate) =>
      candidate.title === title ? { ...candidate, draft, status: 'ready' } : candidate,
    ),
  };
}

export function startConversion(state: BatchState, titles?: readonly string[]): BatchState {
  return {
    titles: state.titles.map((title) =>
      title.status === 'ready' && (titles === undefined || titles.includes(title.title))
        ? { ...title, status: 'converting' }
        : title,
    ),
  };
}

export function applyTitleResult(state: BatchState, result: BatchTitleOutcome): BatchState {
  return {
    titles: state.titles.map((title) =>
      title.title === result.title
        ? {
            ...title,
            status: result.status,
            artifacts: result.artifacts,
            ...(result.failure === undefined ? {} : { failure: result.failure }),
          }
        : title,
    ),
  };
}

export function retryTitle(state: BatchState, title: string): BatchState {
  return {
    titles: state.titles.map((candidate) => {
      if (candidate.title !== title || candidate.status !== 'failed') return candidate;
      return {
        title: candidate.title,
        inputPath: candidate.inputPath,
        status: 'ready' as const,
        draft: candidate.draft,
        volumes: candidate.volumes,
        issues: candidate.issues,
        artifacts: candidate.artifacts,
      };
    }),
  };
}
