import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseMangabindProtocolInfo, parseMangabindReport } from '@/adapters/mangabind/protocol';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixture = fs.readFileSync(
  path.join(repositoryRoot, 'tests', 'fixtures', 'protocol', 'mangabind-v1-plan.json'),
  'utf8',
);

describe('mangabind protocol v1', () => {
  it('parses the frozen planning fixture without losing assignments or Unicode paths', () => {
    const report = parseMangabindReport(fixture);

    expect(report.protocol_version).toBe(1);
    expect(report.mode).toBe('plan');
    expect(report.manga[0]?.name).toBe('Mangá São José');
    expect(report.manga[0]?.units[0]?.metadata_assignment).toMatchObject({
      status: 'applied',
      metadata_volume: 1,
    });
    expect(report.manga[0]?.units[1]?.disposition).toBe('unassigned');
    expect(report.manga[0]?.issues[0]).toMatchObject({
      code: 'unassigned_chapter',
      chapter: 3,
      recoverable: true,
    });
    expect(report.manga[0]?.volumes[0]?.chapters).toEqual(['Chapter 1']);
  });

  it('parses the compatibility handshake and tolerates additive fields', () => {
    const info = parseMangabindProtocolInfo(
      JSON.stringify({
        protocol_version: 1,
        tool: 'mangabind',
        tool_version: '0.4.0',
        capabilities: ['report'],
        future_field: true,
      }),
    );

    expect(info.capabilities).toEqual(['report']);
    expect(info.future_field).toBe(true);
  });

  it.each([
    {
      name: 'malformed JSON',
      input: '{',
      code: 'malformed_json',
    },
    {
      name: 'unsupported protocol',
      input: fixture.replace('"protocol_version": 1', '"protocol_version": 2'),
      code: 'unsupported_protocol',
    },
    {
      name: 'missing required fields',
      input: JSON.stringify({ protocol_version: 1, tool: 'mangabind' }),
      code: 'invalid_payload',
    },
    {
      name: 'missing protocol version',
      input: JSON.stringify({ tool: 'mangabind' }),
      code: 'invalid_payload',
    },
  ])('rejects $name', ({ input, code }) => {
    expect(() => parseMangabindReport(input)).toThrowError(expect.objectContaining({ code }));
  });
});
