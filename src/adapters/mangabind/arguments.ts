export interface MangabindRunArguments {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly metadataFilePath?: string;
  readonly dryRun: boolean;
  readonly batch?: boolean;
  readonly quiet?: boolean;
}

export function buildMangabindArguments({
  batch,
  dryRun,
  inputPath,
  metadataFilePath,
  outputPath,
  quiet,
}: MangabindRunArguments): readonly string[] {
  if (batch === true && metadataFilePath !== undefined) {
    throw new TypeError('Mangabind batch mode cannot use a shared metadata file.');
  }
  return [
    '--input',
    inputPath,
    '--output',
    outputPath,
    ...(metadataFilePath === undefined ? [] : ['--metadata-file', metadataFilePath]),
    ...(batch === true ? ['--batch'] : []),
    ...(dryRun ? ['--dry-run'] : []),
    ...(quiet === true ? ['--quiet'] : []),
    '--json',
  ];
}
