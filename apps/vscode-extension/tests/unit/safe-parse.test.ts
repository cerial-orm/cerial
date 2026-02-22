import { describe, expect, test } from 'bun:test';
import { safeParse, safeTokenize } from '../../server/src/utils/safe-parse';
import { loadFixture } from './helpers';

describe('safeParse', () => {
  test('valid source returns AST with models', () => {
    const source = loadFixture('simple-model.cerial');
    const result = safeParse(source);

    expect(result.ast.models.length).toBeGreaterThan(0);
    expect(result.errors).toEqual([]);
  });

  test('valid source returns correct model names', () => {
    const source = loadFixture('simple-model.cerial');
    const result = safeParse(source);
    const names = result.ast.models.map((m) => m.name);

    expect(names).toContain('User');
    expect(names).toContain('Article');
  });

  test('complex types fixture returns objects, tuples, enums, literals', () => {
    const source = loadFixture('complex-types.cerial');
    const result = safeParse(source);

    expect(result.ast.objects.length).toBeGreaterThan(0);
    expect(result.ast.tuples.length).toBeGreaterThan(0);
    expect(result.ast.enums.length).toBeGreaterThan(0);
    expect(result.ast.literals.length).toBeGreaterThan(0);
    expect(result.errors).toEqual([]);
  });

  test('invalid source returns errors without throwing', () => {
    const source = loadFixture('errors.cerial');
    const result = safeParse(source);

    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('incomplete source returns partial AST with errors', () => {
    const source = loadFixture('incomplete.cerial');
    const result = safeParse(source);

    // Should have some errors (unclosed blocks, incomplete fields)
    expect(result.errors.length).toBeGreaterThan(0);
    // Should still parse some blocks
    expect(result.ast).toBeDefined();
  });

  test('empty string returns empty AST with no errors', () => {
    const result = safeParse('');

    expect(result.ast.models).toEqual([]);
    expect(result.ast.objects).toEqual([]);
    expect(result.ast.tuples).toEqual([]);
    expect(result.ast.enums).toEqual([]);
    expect(result.ast.literals).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test('non-string input returns error without throwing', () => {
    // Force non-string input to test the guard
    const result = safeParse(undefined as unknown as string);

    expect(result.errors.length).toBe(1);
    expect(result.errors[0]!.message).toContain('Expected string source');
    expect(result.ast.models).toEqual([]);
  });

  test('null input returns error without throwing', () => {
    const result = safeParse(null as unknown as string);

    expect(result.errors.length).toBe(1);
    expect(result.errors[0]!.message).toContain('Expected string source');
  });

  test('number input returns error without throwing', () => {
    const result = safeParse(42 as unknown as string);

    expect(result.errors.length).toBe(1);
    expect(result.errors[0]!.message).toContain('Expected string source, got number');
  });

  test('preserves source in AST on valid input', () => {
    const source = 'model Foo { id Record @id }';
    const result = safeParse(source);

    expect(result.ast.source).toBe(source);
  });

  test('sets source to empty string on non-string input', () => {
    const result = safeParse(undefined as unknown as string);

    expect(result.ast.source).toBe('');
  });

  test('forwards external type names to parser', () => {
    const source = 'model Foo {\n  id Record @id\n  addr MyObj\n}';
    const objects = new Set(['MyObj']);
    const result = safeParse(source, objects);

    // Should parse the field with objectName recognized
    const model = result.ast.models[0]!;
    const addrField = model.fields.find((f) => f.name === 'addr');

    expect(addrField).toBeDefined();
    expect(addrField!.objectName).toBe('MyObj');
  });

  test('error positions have line and column', () => {
    const source = loadFixture('errors.cerial');
    const result = safeParse(source);

    for (const error of result.errors) {
      expect(error.position.line).toBeGreaterThanOrEqual(1);
      expect(typeof error.position.column).toBe('number');
    }
  });
});

describe('safeTokenize', () => {
  test('valid source returns tokens', () => {
    const source = loadFixture('simple-model.cerial');
    const tokens = safeTokenize(source);

    expect(tokens.length).toBeGreaterThan(0);
  });

  test('empty string returns only EOF token', () => {
    const tokens = safeTokenize('');

    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.type).toBe('eof');
  });

  test('non-string input returns empty array', () => {
    const tokens = safeTokenize(undefined as unknown as string);

    expect(tokens).toEqual([]);
  });

  test('null input returns empty array', () => {
    const tokens = safeTokenize(null as unknown as string);

    expect(tokens).toEqual([]);
  });

  test('tokens contain model keywords', () => {
    const tokens = safeTokenize('model User { id Record @id }');
    const types = tokens.map((t) => t.type);

    expect(types).toContain('keyword');
  });

  test('incomplete source tokenizes without throwing', () => {
    const source = loadFixture('incomplete.cerial');
    const tokens = safeTokenize(source);

    // Should not throw, may return partial tokens
    expect(Array.isArray(tokens)).toBe(true);
  });
});
