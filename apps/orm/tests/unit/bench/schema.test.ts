import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syntheticSchema } from '../../../bench/schema';
import { generateSingleSchema } from '../../../src/cli/generate';
import { parse } from '../../../src/parser/parser';

const base = { models: 12, fieldsPerModel: 6, seed: 1 };

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

describe('syntheticSchema', () => {
  test('returns identical bytes for the same input', () => {
    expect(syntheticSchema(base)).toBe(syntheticSchema({ ...base }));
  });

  test('a different seed changes the text, the same shape stays', () => {
    const a = syntheticSchema(base);
    const b = syntheticSchema({ ...base, seed: 2 });
    expect(b).not.toBe(a);
    expect(countMatches(b, /^model /gm)).toBe(countMatches(a, /^model /gm));
  });

  test('parses with no errors', () => {
    const result = parse(syntheticSchema(base));
    expect(result.errors).toEqual([]);
    expect(result.ast.models).toHaveLength(12);
  });

  test('has one object pair per ten models, and at least one', () => {
    expect(countMatches(syntheticSchema({ ...base, models: 3 }), /^object BenchProfile/gm)).toBe(1);
    expect(countMatches(syntheticSchema({ ...base, models: 30 }), /^object BenchProfile/gm)).toBe(3);
  });

  test('closes the ring: model i points at i + 1 and the last at the first', () => {
    const text = syntheticSchema({ ...base, models: 4 });
    expect(text).toContain('model BenchModel3 {');
    expect(text).toMatch(/model BenchModel3 \{[^}]*@field\(nextId\) @model\(BenchModel0\)/);
    expect(text).toMatch(/model BenchModel0 \{[^}]*Relation\[\] @model\(BenchModel3\)/);
  });

  test('never relates a model to itself', () => {
    const text = syntheticSchema({ ...base, models: 3 });
    for (let i = 0; i < 3; i++) {
      const body = text.match(new RegExp(`model BenchModel${i} \\{[^}]*\\}`))?.[0] ?? '';
      expect(body).not.toContain(`@model(BenchModel${i})`);
    }
  });

  test('fieldsPerModel changes the field count', () => {
    const fieldLines = (fieldsPerModel: number): number =>
      countMatches(syntheticSchema({ ...base, fieldsPerModel }), /^ {2}field\d+ /gm);
    expect(fieldLines(2)).toBe(2 * base.models);
    expect(fieldLines(9)).toBe(9 * base.models);
  });

  describe('refuses invalid input', () => {
    test.each([0, 1, 2, -3, 2.5, Number.NaN, Number.POSITIVE_INFINITY])('models: %p', (models) => {
      expect(() => syntheticSchema({ ...base, models })).toThrow('models must be an integer of at least 3');
    });

    test.each([0, -1, 1.5, Number.NaN])('fieldsPerModel: %p', (fieldsPerModel) => {
      expect(() => syntheticSchema({ ...base, fieldsPerModel })).toThrow('fieldsPerModel must be');
    });

    test.each([1.5, Number.NaN, Number.POSITIVE_INFINITY])('seed: %p', (seed) => {
      expect(() => syntheticSchema({ ...base, seed })).toThrow('seed must be');
    });
  });

  describe('generates a client', () => {
    const dirs: string[] = [];
    afterAll(() => {
      for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    });

    test.each([10, 100])('at %p models', async (models) => {
      const root = mkdtempSync(join(tmpdir(), 'cerial-bench-schema-'));
      dirs.push(root);
      const schemaPath = join(root, 'schema');
      mkdirSync(schemaPath);
      writeFileSync(join(schemaPath, 'bench.cerial'), syntheticSchema({ ...base, models }));

      const { log, info, warn, error } = console;
      console.log = console.info = console.warn = console.error = () => {};
      try {
        const result = await generateSingleSchema({
          schemaPath,
          outputDir: join(root, 'client'),
          logLevel: 'minimal',
        });
        expect(result.errors).toEqual([]);
        expect(result.success).toBe(true);
      } finally {
        Object.assign(console, { log, info, warn, error });
      }
    });
  });
});
