import { z } from 'zod';

import { CliProtocolError } from '@/adapters/cli-protocol-error';

const protocolVersion = 1 as const;

const baseEventSchema = z
  .object({
    protocol_version: z.literal(protocolVersion),
    tool: z.literal('mangapress'),
    tool_version: z.string().min(1),
    sequence: z.number().int().positive(),
    type: z.string().min(1),
  })
  .passthrough();

const issueContextSchema = {
  manga: z.string().optional(),
  volume: z.union([z.string(), z.number()]).optional(),
  chapter: z.union([z.string(), z.number()]).optional(),
  page: z.number().int().positive().optional(),
  path: z.string().optional(),
} as const;

const knownEventSchemas = {
  protocol: baseEventSchema.extend({ capabilities: z.array(z.string()) }),
  profile: baseEventSchema.extend({
    code: z.string().min(1),
    name: z.string().min(1),
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative(),
    gray_levels: z.number().int().positive(),
    family: z.string().min(1),
  }),
  stage: baseEventSchema.extend({
    stage: z.string().min(1),
    state: z.enum(['started', 'completed']),
  }),
  chapter: baseEventSchema.extend({
    stage: z.literal('process'),
    state: z.enum(['started', 'completed']),
    chapter: z.string(),
    chapter_index: z.number().int().positive(),
    chapter_count: z.number().int().positive(),
  }),
  page: baseEventSchema.extend({
    stage: z.literal('process'),
    state: z.literal('completed'),
    chapter: z.string(),
    chapter_index: z.number().int().positive(),
    page: z.number().int().positive(),
    completed: z.number().int().positive(),
    total: z.number().int().positive(),
  }),
  warning: baseEventSchema.extend({
    severity: z.literal('warning'),
    code: z.string().min(1),
    stage: z.string().min(1),
    recoverable: z.boolean(),
    message: z.string().min(1),
    ...issueContextSchema,
  }),
  error: baseEventSchema.extend({
    severity: z.literal('error'),
    code: z.string().min(1),
    stage: z.string().min(1),
    recoverable: z.boolean(),
    message: z.string().min(1),
    diagnostic: z.string(),
    ...issueContextSchema,
  }),
  result: baseEventSchema.extend({
    status: z.literal('completed'),
    operation: z.enum(['convert', 'list_profiles']),
    dry_run: z.boolean().optional(),
    manga: z.string().optional(),
    author: z.string().optional(),
    format: z.enum(['epub', 'cbz', 'pdf']).optional(),
    profile: z.string().optional(),
    width: z.number().int().nonnegative().optional(),
    height: z.number().int().nonnegative().optional(),
    chapters: z.number().int().nonnegative().optional(),
    source_pages: z.number().int().nonnegative().optional(),
    output_pages: z.number().int().nonnegative().optional(),
    output_path: z.string().optional(),
    bytes: z.number().int().nonnegative().optional(),
    written: z.boolean().optional(),
  }),
} as const;

export type MangapressEvent = z.infer<typeof baseEventSchema>;
export type MangapressErrorEvent = z.infer<(typeof knownEventSchemas)['error']>;
export type MangapressResultEvent = z.infer<(typeof knownEventSchemas)['result']>;

export function isMangapressErrorEvent(event: MangapressEvent): event is MangapressErrorEvent {
  return knownEventSchemas.error.safeParse(event).success;
}

export function isMangapressResultEvent(event: MangapressEvent): event is MangapressResultEvent {
  return knownEventSchemas.result.safeParse(event).success;
}

function parseJson(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch (error) {
    throw new CliProtocolError(
      'malformed_json',
      'mangapress returned a malformed JSON event.',
      error,
    );
  }
}

export function parseMangapressEventLine(line: string): MangapressEvent {
  if (line.trim() === '') {
    throw new CliProtocolError('invalid_payload', 'mangapress returned an empty event line.');
  }

  const payload = parseJson(line);
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
      `mangapress protocol ${String(version.data.protocol_version)} is not supported.`,
    );
  }

  const baseResult = baseEventSchema.safeParse(payload);
  if (!baseResult.success) {
    throw new CliProtocolError(
      'invalid_payload',
      'mangapress returned an event that does not match protocol version 1.',
      baseResult.error,
    );
  }

  const schema = knownEventSchemas[baseResult.data.type as keyof typeof knownEventSchemas];
  if (schema === undefined) {
    return baseResult.data;
  }

  const knownResult = schema.safeParse(payload);
  if (!knownResult.success) {
    throw new CliProtocolError(
      'invalid_payload',
      `mangapress returned an invalid ${baseResult.data.type} event.`,
      knownResult.error,
    );
  }
  return knownResult.data;
}

export class MangapressEventDecoder {
  private buffer = '';
  private expectedSequence = 1;

  push(chunk: string): MangapressEvent[] {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop()!;
    return lines.map((line) => this.parseSequenced(line.replace(/\r$/, '')));
  }

  finish(): MangapressEvent[] {
    if (this.buffer === '') {
      return [];
    }

    const finalLine = this.buffer.replace(/\r$/, '');
    this.buffer = '';
    try {
      return [this.parseSequenced(finalLine)];
    } catch (error) {
      if (error instanceof CliProtocolError && error.code === 'malformed_json') {
        throw new CliProtocolError(
          'incomplete_line',
          'mangapress ended with an incomplete JSON event.',
          error,
        );
      }
      throw error;
    }
  }

  private parseSequenced(line: string): MangapressEvent {
    const event = parseMangapressEventLine(line);
    if (event.sequence !== this.expectedSequence) {
      throw new CliProtocolError(
        'sequence_gap',
        `Expected mangapress event ${this.expectedSequence}, received ${event.sequence}.`,
      );
    }
    this.expectedSequence++;
    return event;
  }
}

export function parseMangapressEventStream(input: string): MangapressEvent[] {
  if (input.trim() === '') {
    throw new CliProtocolError('empty_stream', 'mangapress returned no machine-readable events.');
  }

  const decoder = new MangapressEventDecoder();
  return [...decoder.push(input), ...decoder.finish()];
}
