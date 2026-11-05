/**
 * Unit Tests: sized number types in the generators
 *
 * Migration TYPE and DEFAULT, generated TypeScript, Where, OrderBy and the runtime registry
 * for Int8 ... Float32. Value validation and transforms belong to the query layer.
 */

import { describe, expect, test } from 'bun:test';
import { generateDefineField, generateObjectFieldDefines } from '../../../src/generators/migrations/define-generator';
import {
  generateDefaultClause,
  generateObjectSurrealTypeLiteral,
  generateTupleSurrealTypeLiteral,
  generateTypeClause,
  mapToSurrealType,
  type SurrealQLType,
} from '../../../src/generators/migrations/type-mapper';
import { generateRegistryCode } from '../../../src/generators/metadata/registry-generator';
import { generateObjectOrderByType } from '../../../src/generators/types/objects/derived-generator';
import { generateOrderByType } from '../../../src/generators/types/derived-generator';
import { generateInputInterface, generateInterface } from '../../../src/generators/types/interface-generator';
import { generateObjectInterface } from '../../../src/generators/types/objects/interface-generator';
import { generateTupleOutputType } from '../../../src/generators/types/tuples/interface-generator';
import { generateObjectWhereInterface } from '../../../src/generators/types/objects/where-generator';
import { generateWhereInterface } from '../../../src/generators/types/where-generator';
import type { SchemaFieldType } from '../../../src/types';
import { schemaTypeToSurrealType, schemaTypeToTsInputType, schemaTypeToTsType } from '../../../src/utils/type-utils';
import { elem, field, model, obj, ti, tuple } from './helpers';

const SIZED: readonly (readonly [SchemaFieldType, SurrealQLType])[] = [
  ['int8', 'i8'],
  ['uint8', 'u8'],
  ['int16', 'i16'],
  ['uint16', 'u16'],
  ['int32', 'i32'],
  ['uint32', 'u32'],
  ['uint64', 'u64'],
  ['float16', 'f16'],
  ['float32', 'f32'],
];

describe('sized numbers: type maps', () => {
  test.each(SIZED)('%s maps to the %s kind in both SurrealDB maps', (type, kind) => {
    expect(mapToSurrealType(type)).toBe(kind);
    expect(schemaTypeToSurrealType(type)).toBe(kind);
  });

  test('output TypeScript type is number, except uint64 which is bigint', () => {
    for (const [type] of SIZED) expect(schemaTypeToTsType(type)).toBe(type === 'uint64' ? 'bigint' : 'number');
  });

  test('input TypeScript type is number, except uint64 which also takes a number', () => {
    for (const [type] of SIZED) {
      expect(schemaTypeToTsInputType(type)).toBe(type === 'uint64' ? '(bigint | number)' : 'number');
    }
  });

  test('plain int and float are unchanged', () => {
    expect(mapToSurrealType('int')).toBe('int');
    expect(mapToSurrealType('float')).toBe('float');
    expect(schemaTypeToTsInputType('int')).toBe('number');
  });
});

describe('sized numbers: TYPE clause', () => {
  test('required, optional, nullable and optional nullable', () => {
    expect(generateTypeClause('uint16', true, field({ type: 'uint16' }))).toBe('TYPE u16');
    expect(generateTypeClause('uint16', false, field({ type: 'uint16', isRequired: false }))).toBe('TYPE option<u16>');
    expect(generateTypeClause('uint16', true, field({ type: 'uint16', isNullable: true }))).toBe('TYPE u16 | null');
    expect(generateTypeClause('float32', false, field({ type: 'float32', isRequired: false, isNullable: true }))).toBe(
      'TYPE option<f32 | null>',
    );
  });

  test('array and set', () => {
    expect(generateTypeClause('uint8', true, field({ type: 'uint8', isArray: true }))).toBe('TYPE array<u8>');
    expect(generateTypeClause('int16', true, field({ type: 'int16', isArray: true, isSet: true }))).toBe(
      'TYPE set<i16>',
    );
    expect(generateTypeClause('float16', true, field({ type: 'float16', isArray: true, isSet: true }))).toBe(
      'TYPE set<f16>',
    );
  });

  test('tuple element literal, with optional and nullable elements', () => {
    const info = ti('Pixel', [
      elem({ index: 0, type: 'uint8' }),
      elem({ index: 1, type: 'float32', isNullable: true }),
      elem({ index: 2, type: 'uint64', isOptional: true }),
    ]);

    expect(generateTupleSurrealTypeLiteral(info)).toBe('[u8, f32 | null, option<u64>]');
  });

  test('inline object literal sub-fields, including an array sub-field', () => {
    const info = {
      objectName: 'Calibration',
      fields: [
        field({ name: 'gain', type: 'float32' }),
        field({ name: 'steps', type: 'uint32', isRequired: false }),
        field({ name: 'taps', type: 'int8', isArray: true }),
      ],
    };

    expect(generateObjectSurrealTypeLiteral(info)).toBe('{ gain: f32, steps: option<u32>, taps: array<i8> }');
  });

  test('DEFINE FIELD for a model field and for an object sub-field', () => {
    const m = model('Sensor', 'sensor', [field({ name: 'channel', type: 'uint8' })]);
    expect(generateDefineField(m.fields[0]!, 'sensor', m)).toContain('channel ON TABLE sensor TYPE u8');

    const calib = obj('Calibration', [field({ name: 'gain', type: 'float32' })]);
    const statements = generateObjectFieldDefines('calib', 'sensor', calib, { Calibration: calib });
    expect(statements.join('\n')).toContain('calib.gain ON TABLE sensor TYPE f32');
  });

  test('an unsized int field never gets a sized kind', () => {
    expect(generateTypeClause('int', true, field({ type: 'int' }))).toBe('TYPE int');
  });
});

describe('sized numbers: DEFAULT clause', () => {
  test.each([
    [255, 'uint8', 'DEFAULT 255u8'],
    [-40, 'int16', 'DEFAULT -40i16'],
    [1.5, 'float32', 'DEFAULT 1.5f32'],
    [0, 'uint64', 'DEFAULT 0u64'],
    [65504, 'float16', 'DEFAULT 65504f16'],
  ] as const)('@default(%p) on %s is %s', (value, type, expected) => {
    expect(generateDefaultClause(undefined, value, undefined, undefined, type)).toBe(expected);
  });

  test('@defaultAlways takes the suffix too', () => {
    expect(generateDefaultClause(undefined, undefined, 7, undefined, 'uint8')).toBe('DEFAULT ALWAYS 7u8');
  });

  test('a bigint above the signed range keeps every digit', () => {
    expect(generateDefaultClause(undefined, 18446744073709551615n, undefined, undefined, 'uint64')).toBe(
      'DEFAULT 18446744073709551615u64',
    );
  });

  test('no suffix without a sized type, on an int field, or for a non-number value', () => {
    expect(generateDefaultClause(undefined, 7)).toBe('DEFAULT 7');
    expect(generateDefaultClause(undefined, 7, undefined, undefined, 'int')).toBe('DEFAULT 7');
    expect(generateDefaultClause(undefined, 1.5, undefined, undefined, 'float')).toBe('DEFAULT 1.5');
    expect(generateDefaultClause(undefined, 'x', undefined, undefined, 'uint8')).toBe("DEFAULT 'x'");
  });

  test('timestamp decorators win over a sized type', () => {
    expect(generateDefaultClause('createdAt', undefined, undefined, undefined, 'uint8')).toBe('DEFAULT time::now()');
  });

  test('the model DEFINE FIELD carries the suffix', () => {
    const scalar = field({ name: 'offset', type: 'int16', isRequired: false, defaultValue: -40 });
    const m = model('Sensor', 'sensor', [scalar]);
    expect(generateDefineField(scalar, 'sensor', m)).toContain('TYPE option<i16> DEFAULT -40i16');
  });
});

describe('sized numbers: generated TypeScript', () => {
  const sensor = model('Sensor', 'sensor', [
    field({ name: 'id', type: 'record', isId: true }),
    field({ name: 'channel', type: 'uint8' }),
    field({ name: 'counter', type: 'uint64' }),
    field({ name: 'ids', type: 'uint64', isArray: true }),
    field({ name: 'reading', type: 'float32', isRequired: false }),
  ]);

  test('output interface', () => {
    const out = generateInterface(sensor);
    expect(out).toContain('channel: number;');
    expect(out).toContain('counter: bigint;');
    expect(out).toContain('ids: bigint[];');
    expect(out).toContain('reading?: number');
  });

  test('input interface takes a number as well for uint64, and arrays stay arrays of the union', () => {
    const input = generateInputInterface(sensor);
    expect(input).toContain('channel: number;');
    expect(input).toContain('counter: (bigint | number);');
    expect(input).toContain('ids: (bigint | number)[];');
    expect(input).not.toContain('bigint | number[]');
  });

  test('object output and tuple output', () => {
    const calib = obj('Calibration', [
      field({ name: 'steps', type: 'uint64' }),
      field({ name: 'gain', type: 'float32' }),
    ]);
    expect(generateObjectInterface(calib)).toContain('steps: bigint;');
    expect(generateObjectInterface(calib)).toContain('gain: number;');

    const px = tuple('Pixel', [elem({ index: 0, type: 'uint8' }), elem({ index: 1, type: 'uint64' })]);
    expect(generateTupleOutputType(px)).toContain('[number, bigint]');
  });
});

describe('sized numbers: Where and OrderBy', () => {
  test.each(SIZED)('%s gets Int comparison, in/notIn and between operators', (type) => {
    const where = generateWhereInterface(model('M', 'm', [field({ name: 'v', type })]));
    const ts = type === 'uint64' ? '(bigint | number)' : 'number';

    for (const op of ['eq', 'neq', 'gt', 'gte', 'lt', 'lte']) expect(where).toContain(`${op}?: ${ts};`);
    expect(where).toContain(`in?: ${ts}[];`);
    expect(where).toContain(`notIn?: ${ts}[];`);
    expect(where).toContain(`between?: [${ts}, ${ts}];`);
    // a string operator would mean the field fell through to the default branch
    expect(where).not.toContain('contains?');
  });

  test('same operators as an Int field', () => {
    const strip = (s: string): string => s.replaceAll('v?', '').replaceAll('number', 'T');
    const sized = generateWhereInterface(model('M', 'm', [field({ name: 'v', type: 'uint32' })]));
    const plain = generateWhereInterface(model('M', 'm', [field({ name: 'v', type: 'int' })]));
    expect(strip(sized)).toBe(strip(plain));
  });

  test('nullable and optional keep their operators', () => {
    const where = generateWhereInterface(
      model('M', 'm', [field({ name: 'v', type: 'float16', isNullable: true, isRequired: false })]),
    );
    expect(where).toContain('null | number');
    expect(where).toContain('isNull?');
    expect(where).toContain('isNone?');
  });

  test('array fields take element operators with the union kept intact', () => {
    const where = generateWhereInterface(model('M', 'm', [field({ name: 'v', type: 'uint64', isArray: true })]));
    expect(where).toContain('has?: (bigint | number);');
    expect(where).toContain('hasAll?: (bigint | number)[];');
    expect(where).not.toContain('bigint | number[]');
  });

  test('object sub-fields', () => {
    const where = generateObjectWhereInterface(obj('Calibration', [field({ name: 'steps', type: 'uint32' })]));
    expect(where).toContain('gte?: number;');
    expect(where).toContain('between?: [number, number];');
  });

  test('OrderBy lists every sized field, on models and on objects', () => {
    const orderBy = generateOrderByType(
      model(
        'M',
        'm',
        SIZED.map(([type]) => field({ name: `f_${type}`, type })),
      ),
    );
    for (const [type] of SIZED) expect(orderBy).toContain(`f_${type}?: 'asc' | 'desc';`);

    const objOrderBy = generateObjectOrderByType(obj('Calibration', [field({ name: 'gain', type: 'float32' })]));
    expect(objOrderBy).toContain("gain?: 'asc' | 'desc';");
  });
});

describe('sized numbers: runtime registry', () => {
  test('field metadata keeps the sized type name, the default and the array flags', () => {
    const code = generateRegistryCode([
      model('Sensor', 'sensor', [
        field({ name: 'channel', type: 'uint8', defaultValue: 7 }),
        field({ name: 'tags', type: 'int8', isArray: true, isSet: true }),
        field({ name: 'level', type: 'int' }),
      ]),
    ]);

    expect(code).toContain("type: 'uint8'");
    expect(code).toContain('defaultValue: 7');
    expect(code).toContain("type: 'int8'");
    expect(code).toContain('isSet: true');
    expect(code).toContain("type: 'int'");
  });
});
