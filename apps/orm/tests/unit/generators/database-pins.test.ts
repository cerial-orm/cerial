/**
 * Unit Tests: database pins for tables two schema entries both map to
 *
 * An allowed collision is only safe while each client stays on its own database, so generation pins
 * exactly the colliding tables. A schema with no collision must generate the client it always did.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { loadConfig, resolveConfig } from '../../../src/cli/config';
import { generateMultiSchema } from '../../../src/cli/generate';
import { validateEntryTableNames } from '../../../src/cli/validators';
import { generateClientTemplate } from '../../../src/generators/client/template';
import type { DatabasePin } from '../../../src/types';
import { cleanupTempDir, createTempOutputDir, getFixturePath } from '../../fixtures/multi-schema/helpers';

const models = [{ name: 'MsRtPinned', tableName: 'ms_rt_pinned', fields: [] }];

const pin: DatabasePin = { table: 'ms_rt_pinned', entry: 'east', otherEntries: ['west'], database: 'db_east' };

describe('validateEntryTableNames pins', () => {
  const two = (a?: string, b?: string) => [
    { name: 'east', models: [{ name: 'Shared' }, { name: 'OnlyEast' }], database: a },
    { name: 'west', models: [{ name: 'Shared' }, { name: 'OnlyWest' }], database: b },
  ];

  test('pins only the colliding table, once per owning entry', () => {
    const pins = validateEntryTableNames(two('db_east', 'db_west'));

    expect(pins.get('east')).toEqual([{ table: 'shared', entry: 'east', otherEntries: ['west'], database: 'db_east' }]);
    expect(pins.get('west')).toEqual([{ table: 'shared', entry: 'west', otherEntries: ['east'], database: 'db_west' }]);
  });

  test('names every other owner when three entries collide', () => {
    const pins = validateEntryTableNames([
      { name: 'a', models: [{ name: 'Shared' }], database: 'db_a' },
      { name: 'b', models: [{ name: 'Shared' }], database: 'db_b' },
      { name: 'c', models: [{ name: 'Shared' }], database: 'db_c' },
    ]);

    expect(pins.get('b')![0]!.otherEntries).toEqual(['a', 'c']);
  });

  test('returns no pin when no table collides', () => {
    const pins = validateEntryTableNames([
      { name: 'east', models: [{ name: 'One' }], database: 'db_east' },
      { name: 'west', models: [{ name: 'Two' }], database: 'db_west' },
    ]);

    expect(pins.size).toBe(0);
  });

  test('returns no pin for a collision it refuses', () => {
    expect(() => validateEntryTableNames(two('same', 'same'))).toThrow('same table');
    expect(() => validateEntryTableNames(two('db_east', undefined))).toThrow('same table');
  });
});

describe('generated client template', () => {
  const plain = generateClientTemplate(models, 'CerialClient');

  test('without pins it is identical whether the argument is absent, undefined or empty', () => {
    expect(generateClientTemplate(models, 'CerialClient', undefined, undefined)).toBe(plain);
    expect(generateClientTemplate(models, 'CerialClient', undefined, [])).toBe(plain);
  });

  test('without pins it carries no pin structure and no check', () => {
    expect(plain).not.toContain('DATABASE_PINS');
    expect(plain).not.toContain('mismatched');
    expect(plain).not.toContain('Refusing to connect');
  });

  test('with a pin it records the table, both entries and the database', () => {
    const pinned = generateClientTemplate(models, 'CerialClient', undefined, [pin]);

    expect(pinned).toContain("{ table: 'ms_rt_pinned', entry: 'east', otherEntries: ['west'], database: 'db_east' }");
    expect(pinned).toContain('pin.database !== resolved.database');
    expect(pinned).toContain('new CerialValidationError(');
  });

  test('escapes a quote in an entry name instead of breaking out of the string', () => {
    const hostile = generateClientTemplate(models, 'CerialClient', undefined, [
      { ...pin, entry: "e'ast", otherEntries: ["w'est"], database: "d'b" },
    ]);

    expect(hostile).toContain("entry: 'e\\'ast'");
    expect(hostile).toContain("otherEntries: ['w\\'est']");
    expect(hostile).toContain("database: 'd\\'b'");
  });
});

describe('generateMultiSchema pins', () => {
  const dirs: string[] = [];

  afterAll(async () => {
    await Promise.all(dirs.map(cleanupTempDir));
  });

  async function generate(fixture: string): Promise<{ outputs: Record<string, string>; ok: boolean }> {
    const tempDir = await createTempOutputDir();
    dirs.push(tempDir);
    const fixtureDir = getFixturePath(fixture);
    const config = await loadConfig(join(fixtureDir, 'cerial.config.ts'));
    const entries = resolveConfig(config!, fixtureDir).map((e) => ({ ...e, output: join(tempDir, e.name) }));
    const result = await generateMultiSchema(entries, { logLevel: 'minimal' });

    return { outputs: Object.fromEntries(entries.map((e) => [e.name, e.output])), ok: result.success };
  }

  test('pins the colliding table in each client for its own database', async () => {
    const { outputs, ok } = await generate('pinned-collision');
    const east = await Bun.file(join(outputs.east!, 'client.ts')).text();
    const west = await Bun.file(join(outputs.west!, 'client.ts')).text();

    expect(ok).toBe(true);
    expect(east).toContain("table: 'ms_rt_pinned', entry: 'east', otherEntries: ['west'], database: 'ms_rt_pin_east'");
    expect(west).toContain("table: 'ms_rt_pinned', entry: 'west', otherEntries: ['east'], database: 'ms_rt_pin_west'");
  });

  test('adds no pin to a client whose tables collide with nothing', async () => {
    const { outputs, ok } = await generate('runtime');
    const alpha = await Bun.file(join(outputs.alpha!, 'client.ts')).text();

    expect(ok).toBe(true);
    expect(alpha).not.toContain('DATABASE_PINS');
  });
});
