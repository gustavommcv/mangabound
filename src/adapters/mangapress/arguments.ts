export type MangapressFormat = 'epub' | 'cbz' | 'pdf';

export interface MangapressRunArguments {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly profile: string;
  readonly format: MangapressFormat;
  readonly dryRun: boolean;
}

export function buildMangapressArguments({
  dryRun,
  format,
  inputPath,
  outputPath,
  profile,
}: MangapressRunArguments): readonly string[] {
  return [
    inputPath,
    '--profile',
    profile,
    '--format',
    format,
    '--output',
    outputPath,
    ...(dryRun ? ['--dry-run'] : []),
    '--json-events',
  ];
}
