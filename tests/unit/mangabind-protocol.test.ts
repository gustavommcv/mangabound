import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  MangabindProgressDecoder,
  parseMangabindProgressLine,
  parseMangabindProtocolInfo,
  parseMangabindReport,
} from '@/adapters/mangabind/protocol';

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

describe('recorded mangabind 0.4.0 reports', () => {
  const recorded = (name: string) =>
    parseMangabindReport(
      fs.readFileSync(path.join(repositoryRoot, 'tests', 'fixtures', 'protocol', name), 'utf8'),
    );

  it('parses the volume-in-name report with its effective volumes and parser fields', () => {
    const units = recorded('mangabind-v1-vol-ch-title.json').manga[0]!.units;

    expect(
      units.map((unit) => [unit.parser.volume, unit.parser.chapter, unit.effective_volume]),
    ).toEqual([
      [1, 1, 1],
      [1, 2, 1],
      [2, 8, 2],
      [2, 9, 2],
    ]);
    expect(units.every((unit) => unit.disposition === 'included')).toBe(true);
    expect(units[0]!.parser).toMatchObject({
      name: 'vol-ch-title',
      language: 'pt-br',
      group: 'Morro dos Scans, Power Scans',
    });
  });

  it('parses a duplicate chapter as a conflict that still carries an effective volume', () => {
    const units = recorded('mangabind-v1-duplicate-chapters.json').manga[0]!.units;

    expect(units.map((unit) => unit.disposition)).toEqual(['conflict', 'conflict', 'included']);
    expect(units[0]!.effective_volume).toBe(1);
  });

  it('parses a folder that mixes named and unnamed volumes', () => {
    const units = recorded('mangabind-v1-mixed-grouping.json').manga[0]!.units;

    expect(units.map((unit) => unit.disposition)).toEqual(['unassigned', 'included', 'included']);
    expect(units[0]!.effective_volume).toBeUndefined();
  });
});

describe('mangabind progress side channel', () => {
  const progressFixture = fs.readFileSync(
    path.join(repositoryRoot, 'tests', 'fixtures', 'protocol', 'mangabind-v1-progress.jsonl'),
    'utf8',
  );

  it('parses events recorded from the real sample manga and split process chunks', () => {
    const decoder = new MangabindProgressDecoder();
    const middle = Math.floor(progressFixture.length / 2);
    const events = [
      ...decoder.push(progressFixture.slice(0, 13)),
      ...decoder.push(progressFixture.slice(13, middle).replace(/\n/gu, '\r\n')),
      ...decoder.push(progressFixture.slice(middle)),
      ...decoder.finish(),
    ];

    expect(events[0]).toMatchObject({ stage: 'inspect', state: 'started' });
    expect(events.at(-1)).toMatchObject({ stage: 'write', state: 'completed', completed_pages: 4 });
    expect(
      events.filter((event) => event.stage === 'write' && event.state === 'advanced'),
    ).toHaveLength(4);
  });

  it('accepts an unterminated final line and empty tail', () => {
    const decoder = new MangabindProgressDecoder();
    const line = progressFixture.trimEnd().split('\n')[0]!;
    expect(decoder.push(line)).toEqual([]);
    expect(decoder.finish()).toEqual([parseMangabindProgressLine(line)]);
    expect(decoder.finish()).toEqual([]);
  });

  it.each([
    ['malformed_json', '{'],
    [
      'unsupported_protocol',
      progressFixture.split('\n')[0]!.replace('"protocol_version":1', '"protocol_version":2'),
    ],
    ['invalid_payload', '{"protocol_version":1,"tool":"mangabind","kind":"progress"}'],
  ])('rejects %s progress', (code, line) => {
    expect(() => parseMangabindProgressLine(line)).toThrowError(expect.objectContaining({ code }));
  });

  it('rejects an incomplete final line', () => {
    const decoder = new MangabindProgressDecoder();
    decoder.push('{');
    expect(() => decoder.finish()).toThrowError(
      expect.objectContaining({ code: 'incomplete_line' }),
    );
  });

  it('keeps a complete but invalid final event as a protocol error', () => {
    const decoder = new MangabindProgressDecoder();
    decoder.push('{"protocol_version":1,"tool":"mangabind","kind":"progress"}');
    expect(() => decoder.finish()).toThrowError(
      expect.objectContaining({ code: 'invalid_payload' }),
    );
  });
});
