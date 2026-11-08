/**
 * Unit Tests: validateWhere holds every filter operand to the field's type
 *
 * A create refuses a value of the wrong type for a field. A where operand gets the same rules, at every
 * depth and for every operator, so a string is never compared to a number by the database.
 */

import { describe, expect, test } from 'bun:test';
import { RecordId, StringRecordId } from 'surrealdb';
import {
  convertEnums,
  convertModels,
  createLiteralRegistry,
  convertObjects,
  convertTuples,
  createTupleRegistry,
  resolveObjectFields,
} from '../../../src/generators/metadata';
import { createObjectRegistry, createRegistry } from '../../../src/generators/metadata/registry-generator';
import { parse } from '../../../src/parser/parser';
import { validateWhere } from '../../../src/query/validators';
import type { WhereClause } from '../../../src/types';
import { CerialDecimal } from '../../../src/utils/cerial-decimal';
import { CerialId } from '../../../src/utils/cerial-id';
import { CerialUuid } from '../../../src/utils/cerial-uuid';

const schema = `
enum Role { ADMIN, USER }

object Inner {
  score Int
  tag String
}

object Box {
  count Int
  inner Inner
  nums Int[]
}

tuple Pair {
  first Int,
  second String
}

model Item {
  id Record(int) @id
  name String
  contact Email
  age Int
  small Uint8
  ratio Float
  price Decimal
  active Bool
  born Date
  uid Uuid
  span Duration
  blob Bytes
  role Role
  note String @nullable
  maybe Int?
  nick String?
  tags String[]
  scores Int[]
  box Box
  loose Box @flexible
  pair Pair
  refId Record(int)
}
`;

const { ast } = parse(schema);
const models = convertModels(ast.models);
const objects = convertObjects(ast.objects);
const tuples = convertTuples(ast.tuples);
resolveObjectFields(
  models,
  objects,
  createObjectRegistry(objects),
  createTupleRegistry(tuples),
  createLiteralRegistry(convertEnums(ast.enums)),
);
const item = createRegistry(models).Item!;

const messages = (where: WhereClause): string[] => validateWhere(where, item).errors.map((e) => e.message);
const refused = (where: WhereClause, text: string): void => {
  const found = messages(where);
  expect(found.length).toBeGreaterThan(0);
  expect(found.join('\n')).toContain(text);
};
const w = (value: unknown): WhereClause => value as WhereClause;

describe('where operands — refused', () => {
  test('a string for an int field, in every comparison operator and the shorthand', () => {
    for (const op of ['eq', 'neq', 'not', 'lt', 'lte', 'gt', 'gte'])
      refused(w({ age: { [op]: '5' } }), 'age must be of type int');
    refused(w({ age: '5' }), 'age must be of type int');
  });

  test('a fraction for an int field and an out-of-range sized int', () => {
    refused(w({ age: { gt: 1.5 } }), 'age must be of type int');
    refused(w({ small: { lt: 300 } }), 'Uint8');
    refused(w({ small: { lt: '3' } }), 'small must be of type uint8');
  });

  test('wrong operands in in, notIn, between, hasAll and hasAny name the element', () => {
    refused(w({ age: { in: [1, '2'] } }), 'age[1] must be of type int');
    refused(w({ age: { notIn: ['x'] } }), 'age[0] must be of type int');
    refused(w({ age: { between: ['1', 9] } }), 'age[0] must be of type int');
    refused(w({ tags: { hasAll: ['a', 1] } }), 'tags[1] must be of type string');
    refused(w({ scores: { hasAny: ['1'] } }), 'scores[0] must be of type int');
    refused(w({ tags: { has: 5 } }), 'tags must be of type string');
    refused(w({ age: { in: 5 } }), 'expects an array');
    refused(w({ age: { between: '1' } }), 'expects an array');
  });

  test('string operators need a string; flag operators need a boolean', () => {
    for (const op of ['contains', 'startsWith', 'endsWith'])
      refused(w({ name: { [op]: 5 } }), `${op} expects a string`);
    for (const op of ['isNull', 'isNone', 'isDefined'])
      refused(w({ note: { [op]: 'true' } }), `${op} expects a boolean`);
    refused(w({ tags: { isEmpty: 'true' } }), 'isEmpty expects a boolean');
  });

  test('an operator the field kind does not take is refused naming the field', () => {
    refused(w({ name: { gt: 'a' } }), 'Field "name" is string and does not take the gt operator');
    refused(w({ name: { between: ['a', 'b'] } }), 'name" is string and does not take the between operator');
    refused(w({ uid: { between: ['a', 'b'] } }), 'uid" is uuid and does not take the between operator');
    refused(w({ active: { in: [true] } }), 'active" is bool and does not take the in operator');
    refused(w({ age: { contains: '1' } }), 'age" is int and does not take the contains operator');
    refused(w({ age: { has: 1 } }), 'age" is int and does not take the has operator');
    refused(w({ note: { isEmpty: true } }), 'note" is string and does not take the isEmpty operator');
    refused(w({ box: { count: { startsWith: 'a' } } }), 'box.count" is int and does not take the startsWith operator');
  });

  test('the other scalar types', () => {
    refused(w({ name: 5 }), 'name must be of type string');
    refused(w({ active: 'true' }), 'active must be of type bool');
    refused(w({ ratio: { gt: '1.5' } }), 'ratio must be of type float');
    refused(w({ born: { lt: 5 } }), 'born must be of type date');
    refused(w({ born: 'not a date' }), 'born must be of type date');
    refused(w({ uid: 'nope' }), 'uid must be of type uuid');
    refused(w({ span: 5 }), 'span must be of type duration');
    refused(w({ blob: 5 }), 'blob must be of type bytes');
    refused(w({ price: { gt: 'abc' } }), 'price must be of type decimal');
    refused(w({ refId: 'x' }), 'refId must be a valid int record ID');
    refused(w({ refId: { in: ['x'] } }), 'refId[0] must be a valid int record ID');
  });

  test('an enum operand must be a member', () => {
    refused(w({ role: 'ROOT' }), 'role must be one of');
    refused(w({ role: { in: ['ADMIN', 'ROOT'] } }), 'role[1] must be one of');
    refused(w({ role: { neq: 3 } }), 'role');
  });

  test('null only where the field is nullable', () => {
    refused(w({ age: null }), 'age" is required and not @nullable');
    refused(w({ age: { eq: null } }), 'age" is required and not @nullable');
    refused(w({ age: { in: [1, null] } }), 'age[1]" is required and not @nullable');
    refused(w({ box: { count: null } }), 'box.count" is required and not @nullable');
  });

  test('object sub-fields, nested and in a tuple, at every depth', () => {
    refused(w({ box: { count: '1' } }), 'box.count must be of type int');
    refused(w({ box: { inner: { score: { gt: 'x' } } } }), 'box.inner.score must be of type int');
    refused(w({ box: { nums: { has: 'a' } } }), 'box.nums must be of type int');
    refused(w({ pair: { first: '1' } }), 'pair.first must be of type int');
    refused(w({ pair: { 1: { in: [1] } } }), 'pair.1[0] must be of type string');
    refused(w({ loose: { count: '1' } }), 'loose.count must be of type int');
    refused(w({ box: { inner: { tag: { contains: 1 } } } }), 'contains expects a string');
  });

  test('each refusal names the path', () => {
    const [issue] = validateWhere(w({ AND: [{ age: { lte: '5' } }] }), item).errors;

    expect(issue!.path).toBe('where.AND[0].age.lte');
  });
});

describe('where operands — accepted', () => {
  test('valid operands of every type', () => {
    expect(
      messages(
        w({
          name: { contains: 'a', startsWith: 'b', endsWith: 'c', in: ['a'] },
          contact: { contains: 'gmail' },
          age: { gt: 1, lte: 9, between: [1, 9], in: [1, 2], notIn: [3] },
          small: { lt: 200 },
          ratio: 1.5,
          price: { gt: '1.5', lt: 2, gte: CerialDecimal.from('3') },
          active: true,
          span: '1h',
          blob: new Uint8Array([1]),
          tags: { has: 'a', hasAll: ['a'], hasAny: ['b'], isEmpty: false },
          scores: [1, 2],
          maybe: { isNone: true },
          note: { isNull: true, isNone: false, isDefined: true },
          role: { in: ['ADMIN', 'USER'] },
        }),
      ),
    ).toEqual([]);
  });

  test('a Date and the string forms create accepts', () => {
    expect(messages(w({ born: new Date() }))).toEqual([]);
    expect(messages(w({ born: '2024-01-02' }))).toEqual([]);
    expect(
      messages(w({ born: { gte: '2024-01-02T03:04:05Z', lt: new Date(), between: [new Date(), '2025-01-01'] } })),
    ).toEqual([]);
  });

  test('ids in every accepted form', () => {
    expect(messages(w({ id: 5 }))).toEqual([]);
    expect(messages(w({ id: CerialId.from('item:5') }))).toEqual([]);
    expect(messages(w({ id: new RecordId('item', 5) }))).toEqual([]);
    expect(messages(w({ id: new StringRecordId('item:5') }))).toEqual([]);
    expect(messages(w({ id: { in: [1, new RecordId('item', 2)] } }))).toEqual([]);
    expect(messages(w({ refId: { eq: 3, neq: new RecordId('item', 4) } }))).toEqual([]);
  });

  test('uuid in its object and string forms, an enum member', () => {
    expect(messages(w({ uid: CerialUuid.from('018f1b0e-8c3a-7000-8000-000000000000') }))).toEqual([]);
    expect(messages(w({ uid: '018f1b0e-8c3a-7000-8000-000000000000' }))).toEqual([]);
    expect(messages(w({ role: 'ADMIN' }))).toEqual([]);
  });

  test('null on a nullable field', () => {
    expect(messages(w({ note: null }))).toEqual([]);
    expect(messages(w({ note: { eq: null, not: null, in: ['a', null] } }))).toEqual([]);
    // An optional field that is not @nullable never stores null, so comparing it to null is refused
    expect(messages(w({ maybe: { eq: null, not: null } }))).toHaveLength(2);
    expect(messages(w({ maybe: { eq: null } }))[0]).toContain('maybe');
    expect(messages(w({ maybe: null }))).toHaveLength(1);
    expect(messages(w({ maybe: { isNone: true } }))).toEqual([]);
  });

  test('sub-fields with valid operands, and undeclared keys of a flexible object stay untyped', () => {
    expect(
      messages(w({ box: { count: { gt: 1 }, inner: { score: 2, tag: { contains: 'x' } }, nums: { has: 1 } } })),
    ).toEqual([]);
    expect(messages(w({ pair: { first: 1, second: { in: ['a'] } } }))).toEqual([]);
    expect(messages(w({ pair: { 0: { gt: 1 } } }))).toEqual([]);
    expect(messages(w({ loose: { anything: 'x', other: { gt: 'y' }, count: 1 } }))).toEqual([]);
  });

  test('undefined operands are ignored', () => {
    expect(messages(w({ age: undefined }))).toEqual([]);
    expect(messages(w({ age: { gt: undefined } }))).toEqual([]);
  });
});
