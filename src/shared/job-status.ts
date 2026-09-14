export const jobStatuses = [
  'pending',
  'running',
  'warning',
  'failed',
  'cancelled',
  'complete',
] as const;

export type JobStatus = (typeof jobStatuses)[number];
