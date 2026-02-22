import { describe, expect, test } from 'bun:test';
import { validateUuidFields } from '../../../src/cli/validators/schema-validator';
import type { SchemaAST } from '../../../src/types';

function makeField(overrides: Record<string, unknown> = {}) {
  return {
    name: 'testField',
    type: 'uuid',
    isOptional: false,
    isArray: false,
    decorators: [] as Array<{
      type: string;
      value?: unknown;
      range: { start: { line: number }; column: number; offset: number };
      end: { line: number; column: number; offset: number };
    }>,
    range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 20, offset: 19 } },
    ...overrides,
  };
}

function makeDec(type: string) {
  return { type, range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 10, offset: 9 } } };
}

function makeAST(models: unknown[] = [], objects: unknown[] = []): SchemaAST {
  return {
    models: models as SchemaAST['models'],
    objects: objects as SchemaAST['objects'],
    tuples: [],
    literals: [],
    enums: [],
    source: 'test',
  };
}

describe('UUID Validator', () => {
  describe('type restriction', () => {
    test('allows @uuid on Uuid field', () => {
      const ast = makeAST([
        {
          name: 'Test',
          fields: [makeField({ decorators: [makeDec('uuid')] })],
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 20, offset: 19 } },
        },
      ]);

      const errors = validateUuidFields(ast);
      expect(errors).toHaveLength(0);
    });

    test('rejects @uuid on String field', () => {
      const ast = makeAST([
        {
          name: 'Test',
          fields: [makeField({ type: 'string', decorators: [makeDec('uuid')] })],
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 20, offset: 19 } },
        },
      ]);

      const errors = validateUuidFields(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('can only be used on Uuid fields');
    });

    test('rejects @uuid4 on Int field', () => {
      const ast = makeAST([
        {
          name: 'Test',
          fields: [makeField({ type: 'int', decorators: [makeDec('uuid4')] })],
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 20, offset: 19 } },
        },
      ]);

      const errors = validateUuidFields(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@uuid4');
    });

    test('rejects @uuid7 on Date field', () => {
      const ast = makeAST([
        {
          name: 'Test',
          fields: [makeField({ type: 'date', decorators: [makeDec('uuid7')] })],
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 20, offset: 19 } },
        },
      ]);

      const errors = validateUuidFields(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('@uuid7');
    });
  });

  describe('mutual exclusivity between UUID decorators', () => {
    test('rejects @uuid and @uuid4 together', () => {
      const ast = makeAST([
        {
          name: 'Test',
          fields: [makeField({ decorators: [makeDec('uuid'), makeDec('uuid4')] })],
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 20, offset: 19 } },
        },
      ]);

      const errors = validateUuidFields(ast);
      expect(errors.some((e) => e.message.includes('multiple UUID decorators'))).toBe(true);
    });

    test('rejects @uuid and @uuid7 together', () => {
      const ast = makeAST([
        {
          name: 'Test',
          fields: [makeField({ decorators: [makeDec('uuid'), makeDec('uuid7')] })],
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 20, offset: 19 } },
        },
      ]);

      const errors = validateUuidFields(ast);
      expect(errors.some((e) => e.message.includes('multiple UUID decorators'))).toBe(true);
    });

    test('rejects all three UUID decorators together', () => {
      const ast = makeAST([
        {
          name: 'Test',
          fields: [makeField({ decorators: [makeDec('uuid'), makeDec('uuid4'), makeDec('uuid7')] })],
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 20, offset: 19 } },
        },
      ]);

      const errors = validateUuidFields(ast);
      expect(errors.some((e) => e.message.includes('multiple UUID decorators'))).toBe(true);
    });
  });

  describe('mutual exclusivity with default strategy decorators', () => {
    test('rejects @uuid with @default', () => {
      const ast = makeAST([
        {
          name: 'Test',
          fields: [makeField({ decorators: [makeDec('uuid'), makeDec('default')] })],
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 20, offset: 19 } },
        },
      ]);

      const errors = validateUuidFields(ast);
      expect(errors.some((e) => e.message.includes('@default'))).toBe(true);
    });

    test('rejects @uuid4 with @defaultAlways', () => {
      const ast = makeAST([
        {
          name: 'Test',
          fields: [makeField({ decorators: [makeDec('uuid4'), makeDec('defaultAlways')] })],
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 20, offset: 19 } },
        },
      ]);

      const errors = validateUuidFields(ast);
      expect(errors.some((e) => e.message.includes('@defaultAlways'))).toBe(true);
    });

    test('rejects @uuid7 with @createdAt', () => {
      const ast = makeAST([
        {
          name: 'Test',
          fields: [makeField({ decorators: [makeDec('uuid7'), makeDec('createdAt')] })],
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 20, offset: 19 } },
        },
      ]);

      const errors = validateUuidFields(ast);
      expect(errors.some((e) => e.message.includes('timestamp decorators'))).toBe(true);
    });

    test('rejects @uuid with @updatedAt', () => {
      const ast = makeAST([
        {
          name: 'Test',
          fields: [makeField({ decorators: [makeDec('uuid'), makeDec('updatedAt')] })],
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 20, offset: 19 } },
        },
      ]);

      const errors = validateUuidFields(ast);
      expect(errors.some((e) => e.message.includes('timestamp decorators'))).toBe(true);
    });

    test('rejects @uuid with @now', () => {
      const ast = makeAST([
        {
          name: 'Test',
          fields: [makeField({ decorators: [makeDec('uuid'), makeDec('now')] })],
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 20, offset: 19 } },
        },
      ]);

      const errors = validateUuidFields(ast);
      expect(errors.some((e) => e.message.includes('timestamp decorators'))).toBe(true);
    });
  });

  describe('object field validation', () => {
    test('allows @uuid on Uuid field in object', () => {
      const ast = makeAST(
        [],
        [
          {
            name: 'TestObj',
            fields: [makeField({ decorators: [makeDec('uuid')] })],
            range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 20, offset: 19 } },
          },
        ],
      );

      const errors = validateUuidFields(ast);
      expect(errors).toHaveLength(0);
    });

    test('rejects @uuid on non-Uuid field in object', () => {
      const ast = makeAST(
        [],
        [
          {
            name: 'TestObj',
            fields: [makeField({ type: 'string', decorators: [makeDec('uuid')] })],
            range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 20, offset: 19 } },
          },
        ],
      );

      const errors = validateUuidFields(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('object TestObj');
    });
  });

  describe('no errors for fields without UUID decorators', () => {
    test('plain Uuid field without decorators passes', () => {
      const ast = makeAST([
        {
          name: 'Test',
          fields: [makeField()],
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 20, offset: 19 } },
        },
      ]);

      const errors = validateUuidFields(ast);
      expect(errors).toHaveLength(0);
    });

    test('String field without decorators passes', () => {
      const ast = makeAST([
        {
          name: 'Test',
          fields: [makeField({ type: 'string' })],
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 20, offset: 19 } },
        },
      ]);

      const errors = validateUuidFields(ast);
      expect(errors).toHaveLength(0);
    });
  });
});
