import { z } from 'zod';

import rawManifest from '../../../toolchain.lock.json';

export const toolchainTargetSchema = z.enum([
  'win32-x64',
  'linux-x64',
  'darwin-x64',
  'darwin-arm64',
]);

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const artifactSchema = z.object({
  assetName: z.string().min(1),
  url: z.url().startsWith('https://github.com/'),
  archiveSha256: sha256Schema,
  executableSha256: sha256Schema,
});
const pinSchema = z.object({
  releaseTag: z.string().regex(/^v?\d+\.\d+\.\d+/u),
  protocolVersion: z.literal('1'),
  checksums: z.object({
    assetName: z.literal('checksums.txt'),
    url: z.url().startsWith('https://github.com/'),
    sha256: sha256Schema,
  }),
  artifacts: z.record(toolchainTargetSchema, artifactSchema),
});
const manifestSchema = z.object({
  manifestVersion: z.literal(1),
  state: z.literal('locked'),
  supportedTargets: z.array(toolchainTargetSchema).length(4),
  tools: z.object({
    mangabind: z.object({ sourceRepo: z.url(), pin: pinSchema }),
    mangapress: z.object({ sourceRepo: z.url(), pin: pinSchema }),
  }),
});

export type ToolchainManifest = z.infer<typeof manifestSchema>;

export function parseToolchainManifest(input: unknown): ToolchainManifest {
  const result = manifestSchema.safeParse(input);
  if (!result.success) {
    throw new Error('The bundled-tool manifest is incomplete or invalid.', { cause: result.error });
  }
  return result.data;
}

export function loadToolchainManifest(): ToolchainManifest {
  return parseToolchainManifest(rawManifest);
}
