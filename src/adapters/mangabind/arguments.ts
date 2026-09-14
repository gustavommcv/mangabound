export interface MangabindRunArguments {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly metadataFilePath?: string;
  readonly dryRun: boolean;
}

export function buildMangabindArguments({
  dryRun,
  inputPath,
  metadataFilePath,
  outputPath,
}: MangabindRunArguments): readonly string[] {
  return [
    '--input',
    inputPath,
    '--output',
    outputPath,
    ...(metadataFilePath === undefined ? [] : ['--metadata-file', metadataFilePath]),
    ...(dryRun ? ['--dry-run'] : []),
    '--json',
  ];
}
