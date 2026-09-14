import { z } from 'zod';

import { CliProtocolError } from '@/adapters/cli-protocol-error';

const protocolVersion = 1 as const;

const issueSchema = z
  .object({
    tool: z.literal('mangabind'),
    severity: z.enum(['warning', 'error']),
    code: z.string().min(1),
    stage: z.string().min(1),
    manga: z.string().optional(),
    volume: z.number().optional(),
    chapter: z.number().optional(),
    special: z.string().optional(),
    path: z.string().optional(),
    related_paths: z.array(z.string()).optional(),
    recoverable: z.boolean(),
    message: z.string().min(1),
    diagnostic: z.string().optional(),
  })
  .passthrough();

const parserSchema = z
  .object({
    matched: z.boolean(),
    name: z.string().optional(),
    volume: z.number().optional(),
    chapter: z.number().optional(),
    special: z.string().optional(),
    title: z.string().optional(),
    group: z.string().optional(),
    language: z.string().optional(),
  })
  .passthrough();

const unitSchema = z
  .object({
    name: z.string(),
    path: z.string(),
    kind: z.enum(['folder', 'cbz']),
    page_count: z.number().int().nonnegative(),
    parser: parserSchema,
    metadata_assignment: z
      .object({
        status: z.enum([
          'not_applicable',
          'not_requested',
          'not_found',
          'applied',
          'confirmed',
          'ignored_conflict',
        ]),
        metadata_volume: z.number().optional(),
      })
      .passthrough(),
    effective_volume: z.number().optional(),
    disposition: z.enum(['included', 'unassigned', 'unparsed', 'empty', 'conflict', 'failed']),
  })
  .passthrough();

const volumeSchema = z
  .object({
    number: z.number(),
    output_path: z.string(),
    page_count: z.number().int().nonnegative(),
    chapters: z.array(z.string()),
    written: z.boolean(),
  })
  .passthrough();

const mangaSchema = z
  .object({
    name: z.string(),
    input_path: z.string(),
    metadata_file: z.string().optional(),
    status: z.enum(['completed', 'completed_with_warnings', 'failed']),
    units: z.array(unitSchema),
    volumes: z.array(volumeSchema),
    issues: z.array(issueSchema),
    summary: z
      .object({
        units: z.number().int().nonnegative(),
        volumes: z.number().int().nonnegative(),
        pages: z.number().int().nonnegative(),
        warnings: z.number().int().nonnegative(),
        errors: z.number().int().nonnegative(),
      })
      .passthrough(),
  })
  .passthrough();

const reportSchema = z
  .object({
    protocol_version: z.literal(protocolVersion),
    tool: z.literal('mangabind'),
    tool_version: z.string().min(1),
    kind: z.literal('report'),
    mode: z.enum(['plan', 'execute', 'configuration']),
    status: z.enum(['completed', 'completed_with_warnings', 'failed']),
    input_path: z.string().optional(),
    output_path: z.string().optional(),
    batch: z.boolean(),
    manga: z.array(mangaSchema),
    issues: z.array(issueSchema),
    summary: z
      .object({
        manga: z.number().int().nonnegative(),
        volumes: z.number().int().nonnegative(),
        pages: z.number().int().nonnegative(),
        errors: z.number().int().nonnegative(),
        warnings: z.number().int().nonnegative(),
      })
      .passthrough(),
  })
  .passthrough();

const protocolInfoSchema = z
  .object({
    protocol_version: z.literal(protocolVersion),
    tool: z.literal('mangabind'),
    tool_version: z.string().min(1),
    capabilities: z.array(z.string()),
  })
  .passthrough();

export type MangabindReport = z.infer<typeof reportSchema>;
export type MangabindProtocolInfo = z.infer<typeof protocolInfoSchema>;

function parseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch (error) {
    throw new CliProtocolError('malformed_json', 'Mangabind returned malformed JSON.', error);
  }
}

function parsePayload<T>(schema: z.ZodType<T>, input: string): T {
  const payload = parseJson(input);
  const version = z
    .object({ protocol_version: z.number().optional() })
    .passthrough()
    .safeParse(payload);
  if (
    version.success &&
    version.data.protocol_version !== undefined &&
    version.data.protocol_version !== protocolVersion
  ) {
    throw new CliProtocolError(
      'unsupported_protocol',
      `Mangabind protocol ${String(version.data.protocol_version)} is not supported.`,
    );
  }

  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new CliProtocolError(
      'invalid_payload',
      'Mangabind returned JSON that does not match protocol version 1.',
      result.error,
    );
  }
  return result.data;
}

export function parseMangabindReport(input: string): MangabindReport {
  return parsePayload(reportSchema, input);
}

export function parseMangabindProtocolInfo(input: string): MangabindProtocolInfo {
  return parsePayload(protocolInfoSchema, input);
}
