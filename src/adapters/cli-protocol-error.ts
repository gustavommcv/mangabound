export type CliProtocolErrorCode =
  | 'empty_stream'
  | 'incomplete_line'
  | 'invalid_payload'
  | 'malformed_json'
  | 'sequence_gap'
  | 'unsupported_protocol';

export class CliProtocolError extends Error {
  readonly code: CliProtocolErrorCode;
  override readonly cause?: unknown;

  constructor(code: CliProtocolErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'CliProtocolError';
    this.code = code;
    this.cause = cause;
  }
}
