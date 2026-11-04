import { describe, expect, test } from 'bun:test';
import { parse } from '../../../src/parser/parser';
import {
  getSizedNumberFieldType,
  isSizedNumberType,
  SIZED_NUMBER_TYPES,
} from '../../../src/parser/types/field-types/sized-number-parser';

const NAMES: string[] = ['Int8', 'Uint8', 'Int16', 'Uint16', 'Int32', 'Uint32', 'Uint64', 'Float16', 'Float32'];

const fieldsOf = parse;
const model = (...lines: string[]) => `model M {\n  id Record(int) @id\n${lines.map((l) => `  ${l}\n`).join('')}}\n`;

describe('sized number parser', () => {
  test('declares exactly the nine approved types, with no Int64 or Float64', () => {
    expect(SIZED_NUMBER_TYPES.map((t): string => t.name)).toEqual(NAMES as never);
    expect(isSizedNumberType('Int64')).toBe(false);
    expect(isSizedNumberType('Float64')).toBe(false);
  });

  test.each(NAMES)('%s is recognised and maps to its lower-case field type', (name) => {
    expect(isSizedNumberType(name)).toBe(true);
    expect(getSizedNumberFieldType(name)).toBe(name.toLowerCase() as never);
  });

  test.each(['int8', 'UINT8', 'Uint9', 'Int', 'Float', 'Uint', 'Int8[]', 'Uint8?', ''])(
    '%s is not a sized type token',
    (token) => {
      expect(isSizedNumberType(token)).toBe(false);
      expect(getSizedNumberFieldType(token)).toBeNull();
    },
  );

  test.each(NAMES)('a %s field parses in a model', (name) => {
    const { ast, errors } = fieldsOf(model(`v ${name}`));

    expect(errors).toEqual([]);
    expect(ast.models[0]!.fields[1]).toMatchObject({ name: 'v', type: name.toLowerCase() });
  });

  test('array, optional and nullable forms keep their flags', () => {
    const { ast, errors } = fieldsOf(model('a Int8[]', 'b Uint64?', 'c Float16 @nullable', 'd Uint16[] @set'));
    const [, a, b, c, d] = ast.models[0]!.fields;

    expect(errors).toEqual([]);
    expect(a).toMatchObject({ type: 'int8', isArray: true });
    expect(b).toMatchObject({ type: 'uint64', isOptional: true });
    expect(c).toMatchObject({ type: 'float16', isNullable: true });
    expect(d).toMatchObject({ type: 'uint16', isArray: true });
  });

  test('object fields and tuple elements accept sized types', () => {
    const { ast, errors } = fieldsOf('object O {\n  g Float32\n  s Uint32\n}\ntuple P {\n  Uint8,\n  Uint8\n}\n');

    expect(errors).toEqual([]);
    expect(ast.objects[0]!.fields.map((f) => f.type)).toEqual(['float32', 'uint32']);
    expect(ast.tuples[0]!.elements.map((e) => e.type)).toEqual(['uint8', 'uint8']);
  });

  test.each(['Uint9', 'uint8', 'UINT8', 'Int64', 'Float64', 'Int8s'])('%s is refused as a field type', (token) => {
    const { errors } = fieldsOf(model(`v ${token}`));

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain(`Invalid field type: ${token}`);
  });
});
