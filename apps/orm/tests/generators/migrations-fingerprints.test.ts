import { afterAll, describe, expect, spyOn, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateSingleSchema } from '../../src/cli/generate';
import * as writer from '../../src/generators/migrations/writer';
import type { LiteralRegistry, ModelMetadata, ObjectRegistry, TupleRegistry } from '../../src/types';
import { generatePerModelMigrationCode } from '../../src/generators/migrations/define-generator';
import { buildDesiredSchema, fingerprint } from '../../src/migrations';
import { parseModelRegistry } from '../test-helpers';
import { loadCorpus, SCHEMAS_DIR } from './parity-corpus';

/** Reads the emitted `modelFingerprints` literal back out of the generated source. */
function readFingerprints(code: string): Record<string, string> {
  const body = /export const modelFingerprints[^{]*\{([\s\S]*?)\n\};/.exec(code)?.[1] ?? '';
  const found: Record<string, string> = {};
  for (const [, name, hash] of body.matchAll(/^\s*(\w+): '([0-9a-f]{64})'/gm)) found[name!] = hash!;

  return found;
}

const SCHEMA = (nameType: string): string => `
  model User {
    id Record @id
    name ${nameType}
  }
  model Post {
    id Record @id
    title String
  }
`;

const cleanup: string[] = [];
afterAll(() => cleanup.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('modelFingerprints', () => {
  test('equals fingerprint of the desired model for every corpus model', async () => {
    expect(loadCorpus().errors).toEqual([]);

    // The generator's in-process metadata is the source of truth: the emitted registry drops some decorators.
    type Args = [string, ModelMetadata[], ObjectRegistry?, TupleRegistry?, LiteralRegistry?];
    let captured: Args | undefined;
    const spy = spyOn(writer, 'writeMigrationFile').mockImplementation(async (...args: Args) => {
      captured = args;

      return [];
    });
    const outputDir = mkdtempSync(join(tmpdir(), 'cerial-fingerprints-'));
    cleanup.push(outputDir);
    const { log, info, warn, error } = console;
    console.log = console.info = console.warn = console.error = () => {};
    try {
      await generateSingleSchema({ schemaPath: SCHEMAS_DIR, outputDir, logLevel: 'minimal' });
    } finally {
      Object.assign(console, { log, info, warn, error });
      spy.mockRestore();
    }

    if (!captured) throw new Error('the generator did not write a migration file');
    const [, models, objects, tuples, literals] = captured;
    const emitted = readFingerprints(generatePerModelMigrationCode(models, objects, tuples, literals).aggregator);
    const registry = Object.fromEntries(models.map((m) => [m.name, m]));
    const tables = buildDesiredSchema(registry, objects, tuples, literals).tables;

    expect(models.length).toBeGreaterThan(50);
    expect(Object.keys(emitted)).toEqual(models.map((m) => m.name));
    models.forEach((m, index) => expect(emitted[m.name]).toBe(fingerprint(tables[index]!)));
  });

  test('emitted literal matches the desired table fingerprint for a registry', () => {
    const registry = parseModelRegistry(SCHEMA('String'));
    const emitted = readFingerprints(generatePerModelMigrationCode(Object.values(registry)).aggregator);
    const tables = buildDesiredSchema(registry).tables;

    expect(Object.keys(emitted)).toEqual(Object.keys(registry));
    Object.keys(registry).forEach((name, index) => expect(emitted[name]).toBe(fingerprint(tables[index]!)));
  });

  test('a one-field change moves only that model', () => {
    const before = readFingerprints(
      generatePerModelMigrationCode(Object.values(parseModelRegistry(SCHEMA('String')))).aggregator,
    );
    const after = readFingerprints(
      generatePerModelMigrationCode(Object.values(parseModelRegistry(SCHEMA('Int')))).aggregator,
    );

    expect(after.User).not.toBe(before.User);
    expect(after.Post).toBe(before.Post);
  });
});
