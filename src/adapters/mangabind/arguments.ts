export interface MangabindRunArguments {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly metadataFilePath?: string;
  readonly dryRun: boolean;
  readonly batch?: boolean;
  readonly quiet?: boolean;
  /** Write the whole manga as one .cbz instead of one per volume - see mangabind's ADR 0012. */
  readonly combine?: boolean;
}

export function buildMangabindArguments({
  batch,
  combine,
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
    ...(combine === true ? ['--combine'] : []),
    ...(dryRun ? ['--dry-run'] : []),
    ...(quiet === true ? ['--quiet'] : []),
    '--json',
  ];
}
