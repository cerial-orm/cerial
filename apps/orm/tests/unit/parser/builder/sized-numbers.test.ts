import { describe, expect, test } from 'bun:test';
import { e, f, model, object, tuple } from '../../../../src/schema';
import { fieldNode } from '../../../../src/parser/builder';
import { parse } from '../../../../src/parser/parser';
import { SIZED_NUMBER_TYPES } from '../../../../src/parser/types/field-types/sized-number-parser';
import type { ASTField } from '../../../../src/types';
import { withoutPosition } from './helpers';

function parsed(line: string): ASTField {
  const { ast, errors } = parse(`model M {\n  x ${line}\n}\n`);
  expect(errors).toHaveLength(0);

  return ast.models[0]!.fields[0]!;
}

const FACTORIES = SIZED_NUMBER_TYPES.map((t) => [t.name, t.fieldType] as const);

describe('sized number factories', () => {
  test('the nine factories exist and nothing else was added for 64-bit types', () => {
    expect(SIZED_NUMBER_TYPES.map((t) => t.fieldType)).toEqual([
      'int8',
      'uint8',
      'int16',
      'uint16',
      'int32',
      'uint32',
      'uint64',
      'float16',
      'float32',
    ]);
    expect('int64' in f).toBe(false);
    expect('float64' in f).toBe(false);
  });

  describe.each(FACTORIES)('%s', (name, factory) => {
    const make = f[factory] as typeof f.int8;

    test('matches the parser for every modifier', () => {
      const cases: [object, string][] = [
        [make(), name],
        [make().optional(), `${name}?`],
        [make().nullable(), `${name} @nullable`],
        [make().optional().nullable(), `${name}? @nullable`],
        [make().array(), `${name}[]`],
        [make().array().set(), `${name}[] @set`],
        [make().array().distinct(), `${name}[] @distinct`],
        [make().unique(), `${name} @unique`],
        [make().index(), `${name} @index`],
        [make().readonly(), `${name} @readonly`],
        [make().private(), `${name} !!private`],
        [make().default(7), `${name} @default(7)`],
        [make().defaultAlways(7), `${name} @defaultAlways(7)`],
      ];

      for (const [built, line] of cases) {
        expect(withoutPosition(fieldNode(built, 'x'))).toEqual(withoutPosition(parsed(line)));
      }
    });

    test('names its own field type', () => {
      expect(fieldNode(make(), 'x').type).toBe(factory);
    });

    test('a builder is immutable', () => {
      const base = make();
      base.optional();

      expect(fieldNode(base, 'x').isOptional).toBe(false);
    });
  });

  test('negative and fractional defaults match the parser', () => {
    expect(withoutPosition(fieldNode(f.int16().default(-40), 'x'))).toEqual(
      withoutPosition(parsed('Int16 @default(-40)')),
    );
    expect(withoutPosition(fieldNode(f.float32().default(1.5), 'x'))).toEqual(
      withoutPosition(parsed('Float32 @default(1.5)')),
    );
  });

  test('works as an object field, a tuple element and a model field', () => {
    const Cal = object('Cal', { gain: f.float32(), steps: f.uint32().optional() });
    const Px = tuple('Px', [e.uint8(), e.float16().nullable()]);
    const M = model('M', { id: f.record().id(), c: f.object(Cal), p: f.tuple(Px), n: f.uint64().array() });

    expect(M.name).toBe('M');
  });

  test('the parser still refuses a lookalike name', () => {
    const { errors } = parse('model M {\n  x Int128\n}\n');

    expect(errors[0]!.message).toContain('Invalid field type: Int128');
    expect(errors[0]!.message).toContain('Uint64');
  });
});
