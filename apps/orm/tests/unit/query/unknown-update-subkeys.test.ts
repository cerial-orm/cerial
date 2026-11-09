/**
 * Unit Tests: unknown sub-keys in update data are rejected on strict objects
 *
 * The builder skips an undeclared sub-key of a strict object, so an update whose
 * only key was a typo emitted no SET clause and reported success. The validator
 * now rejects it with the dotted path from the model root. @flexible is read per
 * field, so the same object type can be flexible on one field and strict on another.
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
import { validateUpdateData } from '../../../src/query/validators/data-validator';

const schema = `
object Inner {
  label String
}

object Mid {
  note String
  inner Inner
  looseInner Inner @flexible
}

object Outer {
  title String
  mid Mid
  looseMid Mid @flexible
}

tuple Pair {
  Inner,
  mid Mid
}

object Holder {
  pair Pair
}

model Post {
  id Record @id
  name String
  strict Outer
  loose Outer @flexible
  optStrict Outer?
  pair Pair?
  holder Holder
  items Inner[]
}
`;

const { ast } = parse(schema);
const models = convertModels(ast.models);
const objects = convertObjects(ast.objects);
const tuples = convertTuples(ast.tuples);
resolveObjectFields(models, objects, createObjectRegistry(objects), createTupleRegistry(tuples));

const post = createRegistry(models).Post!;

const errorsFor = (data: Record<string, unknown>) => validateUpdateData(data, post).errors;
const messages = (data: Record<string, unknown>) => errorsFor(data).map((e) => e.message);

describe('validateUpdateData strict object sub-keys', () => {
  test('rejects a typo at depth 1 with the dotted path from the model root', () => {
    const errors = errorsFor({ strict: { titel: 'x' } });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.field).toBe('strict.titel');
    expect(errors[0]!.message).toBe(
      "Unknown field 'strict.titel' on model Post — check the field name against the schema",
    );
  });

  test('rejects a typo at depth 2', () => {
    expect(errorsFor({ strict: { mid: { note: 'ok', nte: 'x' } } }).map((e) => e.field)).toEqual(['strict.mid.nte']);
  });

  test('rejects a typo at depth 3', () => {
    expect(errorsFor({ strict: { mid: { inner: { lable: 'x' } } } }).map((e) => e.field)).toEqual([
      'strict.mid.inner.lable',
    ]);
  });

  test('rejects whatever the value: null, NONE-like and undefined-free values alike', () => {
    expect(errorsFor({ strict: { titel: null } })).toHaveLength(1);
    expect(errorsFor({ strict: { titel: { deep: 1 } } })).toHaveLength(1);
    expect(errorsFor({ strict: { titel: undefined } })).toHaveLength(0);
  });

  test('names every unknown key and keeps the valid ones', () => {
    expect(errorsFor({ strict: { title: 'ok', foo: 1, bar: 2 } }).map((e) => e.field)).toEqual([
      'strict.foo',
      'strict.bar',
    ]);
  });

  test('rejects a hostile key without altering it', () => {
    const key = "x'; REMOVE TABLE victim; --";
    expect(errorsFor({ strict: { [key]: 1 } })[0]!.message).toContain(`Unknown field 'strict.${key}' on model Post`);
  });

  test('rejects on an optional object field', () => {
    expect(errorsFor({ optStrict: { titel: 'x' } }).map((e) => e.field)).toEqual(['optStrict.titel']);
  });

  test('accepts declared sub-keys at every depth', () => {
    expect(errorsFor({ strict: { title: 'a', mid: { note: 'b', inner: { label: 'c' } } } })).toEqual([]);
  });

  test('accepts a { set } full replace whose keys are declared', () => {
    expect(errorsFor({ strict: { set: { title: 'a', mid: { note: 'b', inner: { label: 'c' } } } } })).toEqual([]);
    expect(errorsFor({ strict: { mid: { set: { note: 'b', inner: { label: 'c' } } } } })).toEqual([]);
  });

  test('refuses an undeclared key inside a { set } full replace, naming the path', () => {
    expect(errorsFor({ strict: { set: { title: 'a', anything: 1 } } }).map((e) => e.field)).toEqual([
      'strict.anything',
    ]);
    expect(errorsFor({ strict: { mid: { set: { whatever: 1 } } } }).map((e) => e.field)).toEqual([
      'strict.mid.whatever',
    ]);
  });

  test('a { set } on a @flexible field keeps accepting undeclared keys', () => {
    expect(errorsFor({ loose: { set: { title: 'a', anything: 1 } } })).toEqual([]);
  });

  test('does not inspect array-of-object fields, whose values are bound whole', () => {
    expect(errorsFor({ items: [{ label: 'a' }] })).toEqual([]);
    expect(errorsFor({ items: { push: { label: 'a' } } })).toEqual([]);
  });
});

describe('validateUpdateData @flexible is per field, not per object type', () => {
  test('the same Outer type is flexible on loose and strict on strict', () => {
    expect(errorsFor({ loose: { extra: 'x' } })).toEqual([]);
    expect(messages({ strict: { extra: 'x' } })).toEqual([
      "Unknown field 'strict.extra' on model Post — check the field name against the schema",
    ]);
  });

  test('the same Mid type is flexible under looseMid and strict under mid', () => {
    expect(errorsFor({ strict: { looseMid: { extra: 'x' } } })).toEqual([]);
    expect(errorsFor({ strict: { mid: { extra: 'x' } } }).map((e) => e.field)).toEqual(['strict.mid.extra']);
  });

  test('flexibility does not propagate down: a strict field under a flexible parent still rejects', () => {
    expect(errorsFor({ loose: { extra: 'x', mid: { extra: 'y' } } }).map((e) => e.field)).toEqual(['loose.mid.extra']);
  });

  test('flexibility does not propagate up: a flexible field under a strict parent accepts, the parent still rejects', () => {
    expect(
      errorsFor({ strict: { extra: 'x', mid: { looseInner: { extra: 'y' }, inner: { extra: 'z' } } } }).map(
        (e) => e.field,
      ),
    ).toEqual(['strict.extra', 'strict.mid.inner.extra']);
  });
});

// A value bound whole is checked against every required sub-field, so the elements written whole are complete
const completeMid = { note: 'n', inner: { label: 'l' }, looseInner: { label: 'l' } };

describe('validateUpdateData objects inside tuples', () => {
  test('rejects an unknown element key of a per-element tuple update', () => {
    expect(errorsFor({ pair: { nope: 1 } }).map((e) => e.field)).toEqual(['pair.nope']);
  });

  test('accepts element keys by name and by index', () => {
    expect(errorsFor({ pair: { mid: { note: 'a' } } })).toEqual([]);
    expect(errorsFor({ pair: { 1: { note: 'a' } } })).toEqual([]);
  });

  test('rejects a key that only starts with a valid index', () => {
    expect(errorsFor({ pair: { '1x': { note: 'a' } } }).map((e) => e.field)).toEqual(['pair.1x']);
  });

  test('rejects a typo in an object element, at depth 2 and 3', () => {
    expect(errorsFor({ pair: { mid: { nte: 'x' } } }).map((e) => e.field)).toEqual(['pair.mid.nte']);
    expect(errorsFor({ pair: { 0: { lable: 'x' } } }).map((e) => e.field)).toEqual(['pair.0.lable']);
    expect(errorsFor({ pair: { mid: { inner: { lable: 'x' } } } }).map((e) => e.field)).toEqual([
      'pair.mid.inner.lable',
    ]);
  });

  test('rejects a typo in a tuple reached through an object field', () => {
    expect(errorsFor({ holder: { pair: { mid: { inner: { lable: 'x' } } } } }).map((e) => e.field)).toEqual([
      'holder.pair.mid.inner.lable',
    ]);
    expect(errorsFor({ holder: { pair: { nope: 1 } } }).map((e) => e.field)).toEqual(['holder.pair.nope']);
  });

  test('accepts an array-form tuple replace and a { set } element', () => {
    expect(errorsFor({ pair: [{ label: 'a' }, completeMid] })).toEqual([]);
    expect(errorsFor({ pair: { mid: { set: completeMid } } })).toEqual([]);
  });

  test('refuses an undeclared key in a { set } element, which the inline tuple type would refuse', () => {
    expect(errorsFor({ pair: { mid: { set: { ...completeMid, whatever: 1 } } } }).map((e) => e.field)).toEqual([
      'pair.mid.whatever',
    ]);
  });
});

const mid = { note: 'n', inner: { label: 'l' }, looseInner: { label: 'l' } };
const outer = { title: 't', mid, looseMid: mid };

describe('every update entry point rejects the typo and emits nothing', () => {
  const data = { strict: { titel: 'x' } };
  const message = "Invalid data: Unknown field 'strict.titel' on model Post";

  test('updateMany', () => {
    expect(() => compileUpdateMany(post, { where: { name: 'a' }, data })).toThrow(message);
  });

  test('updateUnique', () => {
    expect(() => compileUpdateUnique(post, { where: { id: 'post:1' }, data })).toThrow(message);
  });

  test('upsert, update half', () => {
    expect(() =>
      compileUpsert(post, {
        where: { id: 'post:1' },
        create: {
          name: 'a',
          strict: outer,
          loose: outer,
          holder: { pair: [{ label: 'l' }, { note: 'n', inner: { label: 'l' }, looseInner: { label: 'l' } }] },
        },
        update: data,
      }),
    ).toThrow("Invalid data: Unknown field 'strict.titel' on model Post");
  });
});
