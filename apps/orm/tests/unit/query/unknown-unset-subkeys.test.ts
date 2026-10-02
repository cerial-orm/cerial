/**
 * Unit Tests: unknown sub-keys in `unset` are rejected on strict objects and tuples
 *
 * `unset` is merged into the update data as NONE values after validation, so an undeclared sub-key
 * used to reach the builder, emit a NONE write to a path that does not exist and report success.
 * It is now walked like the equivalent `data` value and rejected with the same message shape.
 */

import { describe, expect, test } from 'bun:test';
import {
  convertModels,
  convertObjects,
  convertTuples,
  createTupleRegistry,
  resolveObjectFields,
} from '../../../src/generators/metadata';
import { createObjectRegistry, createRegistry } from '../../../src/generators/metadata/registry-generator';
import { parse } from '../../../src/parser/parser';
import { compileUpdateMany, compileUpdateUnique, compileUpsert } from '../../../src/query/builder';
import { validateUnset, validateUpdateData } from '../../../src/query/validators/data-validator';

const schema = `
enum Kind { A, B }

object Inner {
  label String?
  kind Kind?
}

object Mid {
  note String?
  inner Inner
  looseInner Inner @flexible
}

object Outer {
  title String?
  mid Mid
  looseMid Mid @flexible
}

tuple Pair {
  Inner,
  mid Mid
}

model Post {
  id Record @id
  name String
  strict Outer
  loose Outer @flexible
  optStrict Outer?
  pair Pair?
  items Inner[]
}
`;

const { ast } = parse(schema);
const models = convertModels(ast.models);
const objects = convertObjects(ast.objects);
const tuples = convertTuples(ast.tuples);
resolveObjectFields(models, objects, createObjectRegistry(objects), createTupleRegistry(tuples));

const registry = createRegistry(models);
const post = registry.Post!;

const errorsFor = (unset: Record<string, unknown>) => validateUnset(unset, post).errors;
const unknown = (path: string) => `Unknown field '${path}' on model Post — check the field name against the schema`;

describe('validateUnset sub-keys on strict objects', () => {
  test('rejects a typo at depth 1 with the dotted path from the model root', () => {
    const errors = errorsFor({ strict: { titel: true } });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.field).toBe('strict.titel');
    expect(errors[0]!.message).toBe(unknown('strict.titel'));
  });

  test('rejects a typo at depth 2 and 3', () => {
    expect(errorsFor({ strict: { mid: { nte: true } } }).map((e) => e.field)).toEqual(['strict.mid.nte']);
    expect(errorsFor({ strict: { mid: { inner: { lable: true } } } }).map((e) => e.field)).toEqual([
      'strict.mid.inner.lable',
    ]);
  });

  test('uses the same message as the equivalent data value', () => {
    const fromData = validateUpdateData({ strict: { titel: 'x' } }, post).errors;
    expect(errorsFor({ strict: { titel: true } }).map((e) => e.message)).toEqual(fromData.map((e) => e.message));
  });

  test('names every unknown key and keeps the valid ones', () => {
    expect(errorsFor({ strict: { title: true, foo: true, bar: true } }).map((e) => e.field)).toEqual([
      'strict.foo',
      'strict.bar',
    ]);
  });

  test('rejects whatever the unknown key maps to', () => {
    expect(errorsFor({ strict: { titel: { deep: true } } })).toHaveLength(1);
  });

  test('rejects a hostile key without altering it', () => {
    const key = "x'; REMOVE TABLE victim; --";
    expect(errorsFor({ strict: { [key]: true } })[0]!.message).toBe(unknown(`strict.${key}`));
  });

  test('rejects on an optional object field', () => {
    expect(errorsFor({ optStrict: { titel: true } }).map((e) => e.field)).toEqual(['optStrict.titel']);
  });

  test('accepts declared sub-keys at every depth, including an enum leaf', () => {
    expect(errorsFor({ strict: { title: true, mid: { note: true, inner: { label: true, kind: true } } } })).toEqual([]);
  });

  test('keeps validating the rest of the unset object', () => {
    const fields = errorsFor({ strict: { titel: true }, name: true, nope: true }).map((e) => e.field);
    expect(fields).toEqual(['strict.titel', 'name', 'nope']);
  });
});

describe('validateUnset @flexible is per field, not per object type', () => {
  test('the same Outer type is flexible on loose and strict on strict', () => {
    expect(errorsFor({ loose: { extra: true } })).toEqual([]);
    expect(errorsFor({ strict: { extra: true } }).map((e) => e.field)).toEqual(['strict.extra']);
  });

  test('the same Mid type is flexible under looseMid and strict under mid', () => {
    expect(errorsFor({ strict: { looseMid: { extra: true } } })).toEqual([]);
    expect(errorsFor({ strict: { mid: { extra: true } } }).map((e) => e.field)).toEqual(['strict.mid.extra']);
  });
});

describe('validateUnset sub-keys on tuples', () => {
  test('accepts an element by name or index', () => {
    expect(errorsFor({ pair: { mid: true } })).toEqual([]);
    expect(errorsFor({ pair: { 0: true } })).toEqual([]);
  });

  test('rejects an element the tuple does not have', () => {
    expect(errorsFor({ pair: { nope: true } }).map((e) => e.field)).toEqual(['pair.nope']);
    expect(errorsFor({ pair: { 5: true } }).map((e) => e.field)).toEqual(['pair.5']);
  });

  test('rejects a typo inside an object element', () => {
    expect(errorsFor({ pair: { mid: { nte: true } } }).map((e) => e.field)).toEqual(['pair.mid.nte']);
  });
});

describe('validateUnset leaves array-of-object fields alone', () => {
  test('does not inspect an unset object on an array field', () => {
    expect(errorsFor({ items: { anything: true } })).toEqual([]);
  });
});

describe('the update entry points reject it before building a query', () => {
  const outer = { mid: { inner: {}, looseInner: {} }, looseMid: { inner: {}, looseInner: {} } };
  const message = `Invalid unset: ${unknown('strict.titel')}`;

  test('compileUpdateMany', () => {
    expect(() =>
      compileUpdateMany(post, { where: { name: 'a' }, data: {}, unset: { strict: { titel: true } } }, registry),
    ).toThrow(message);
  });

  test('compileUpdateUnique', () => {
    expect(() =>
      compileUpdateUnique(post, { where: { id: 'a' }, data: {}, unset: { strict: { titel: true } } }, registry),
    ).toThrow(message);
  });

  test('compileUpsert', () => {
    expect(() =>
      compileUpsert(
        post,
        {
          where: { id: 'a' },
          create: { name: 'n', strict: outer, loose: outer },
          update: {},
          unset: { strict: { titel: true } },
        },
        registry,
      ),
    ).toThrow(message);
  });

  test('a valid unset still compiles', () => {
    expect(() =>
      compileUpdateMany(post, { where: { name: 'a' }, data: {}, unset: { strict: { title: true } } }, registry),
    ).not.toThrow();
  });
});
