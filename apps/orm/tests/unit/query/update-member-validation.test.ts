/**
 * Unit Tests: tuple and literal member validation on every update path
 *
 * The builder coerces update data before the query is built (a fraction in an int member is
 * floored), so a check made after the transform sees a valid number and the write stores the wrong
 * value. updateMany, updateUnique and upsert validate the data as the caller wrote it, as create does.
 */

import { describe, expect, test } from 'bun:test';
import {
  convertLiterals,
  convertModels,
  convertObjects,
  convertTuples,
  createLiteralRegistry,
  createTupleRegistry,
  resolveObjectFields,
} from '../../../src/generators/metadata';
import { createObjectRegistry, createRegistry } from '../../../src/generators/metadata/registry-generator';
import { parse } from '../../../src/parser/parser';
import { compileUpdateMany, compileUpdateUnique, compileUpsert } from '../../../src/query/builder';

const schema = `
object Place {
  street String
  floor Int
}

tuple Pair {
  Int,
  Float
}

tuple Located {
  tag String,
  Place
}

literal Shape { 'none', Pair, Place }

model Item {
  id Record @id
  pair Pair
  optPair Pair?
  pairs Pair[]
  located Located?
  shape Shape?
}
`;

const { ast } = parse(schema);
const models = convertModels(ast.models);
const objects = convertObjects(ast.objects);
const tuples = convertTuples(ast.tuples);
const literals = createLiteralRegistry(convertLiterals(ast.literals));
resolveObjectFields(models, objects, createObjectRegistry(objects), createTupleRegistry(tuples), literals);
const item = createRegistry(models).Item!;

type Run = (data: Record<string, unknown>) => unknown;

const paths: Record<string, Run> = {
  updateMany: (data) => compileUpdateMany(item, { where: { id: 'a' }, data }),
  updateUnique: (data) => compileUpdateUnique(item, { where: { id: 'a' }, data }),
  'upsert update half': (data) => compileUpsert(item, { where: { id: 'a' }, create: { pair: [1, 2] }, update: data }),
};

const refused = (run: Run, data: Record<string, unknown>): string => {
  try {
    run(data);
  } catch (e) {
    return (e as Error).message;
  }

  return '';
};

describe.each(Object.entries(paths))('%s', (_name, run) => {
  describe('plain set', () => {
    test('refuses a fractional number in an int member', () => {
      expect(refused(run, { pair: [1.5, 2] })).toContain('pair[0] must be of type int');
    });

    test('accepts an integral number in int and float members, and a fraction in a float member', () => {
      expect(() => run({ pair: [1.0, 2] })).not.toThrow();
      expect(() => run({ pair: [3, 2.5] })).not.toThrow();
    });

    test('refuses a wrong-typed member', () => {
      expect(refused(run, { pair: [1, 'a'] })).toContain('pair[1] must be of type float');
      expect(refused(run, { located: [5, { street: 's', floor: 1 }] })).toContain('located[0] must be of type string');
    });

    test('refuses an undeclared key and a fraction in a strict object element', () => {
      expect(refused(run, { located: ['a', { street: 's', floor: 1, extra: 1 }] })).toContain('located[1].extra');
      expect(refused(run, { located: ['a', { street: 's', floor: 1.5 }] })).toContain('located[1].floor');
    });
  });

  describe('{ set }', () => {
    test('refuses a fraction in an int member, accepts an integral one', () => {
      expect(refused(run, { optPair: { set: [1.5, 2] } })).toContain('optPair[0] must be of type int');
      expect(() => run({ optPair: { set: [1, 2.5] } })).not.toThrow();
    });

    test('refuses a bad element in an array tuple field', () => {
      expect(
        refused(run, {
          pairs: {
            set: [
              [1, 2],
              [1.5, 2],
            ],
          },
        }),
      ).toContain('pairs[1][0] must be of type int');
      expect(() =>
        run({
          pairs: {
            set: [
              [1, 2],
              [3, 4.5],
            ],
          },
        }),
      ).not.toThrow();
    });
  });

  describe('push', () => {
    test('refuses a fraction in an int member of a pushed tuple', () => {
      expect(refused(run, { pairs: { push: [1.5, 2] } })).toContain('pairs.push[0][0] must be of type int');
      expect(
        refused(run, {
          pairs: {
            push: [
              [1, 2],
              [1.5, 2],
            ],
          },
        }),
      ).toContain('pairs.push[1][0] must be of type int');
    });

    test('accepts a valid pushed tuple', () => {
      expect(() => run({ pairs: { push: [1, 2.5] } })).not.toThrow();
      expect(() =>
        run({
          pairs: {
            push: [
              [1, 2],
              [3, 4],
            ],
          },
        }),
      ).not.toThrow();
    });
  });

  describe('per-element tuple update (object form)', () => {
    test('refuses a fraction in an int element, accepts an integral one', () => {
      expect(refused(run, { pair: { '0': 1.5 } })).toContain('pair.0 must be of type int');
      expect(() => run({ pair: { '0': 4 } })).not.toThrow();
    });

    test('refuses a wrong-typed element, accepts a valid float', () => {
      expect(refused(run, { pair: { '1': 'a' } })).toContain('pair.1 must be of type float');
      expect(() => run({ pair: { '1': 2.5 } })).not.toThrow();
    });

    test('refuses a bad key inside an object element', () => {
      expect(refused(run, { located: { '1': { floor: 1.5 } } })).toContain('located.1.floor');
    });
  });

  describe('literal variants', () => {
    test('refuses an object variant with a fraction or an undeclared key', () => {
      expect(refused(run, { shape: { street: 's', floor: 1.5 } })).not.toBe('');
      expect(refused(run, { shape: { street: 's', floor: 1, extra: 1 } })).not.toBe('');
    });

    test('refuses a tuple variant with a fraction in an int member', () => {
      expect(refused(run, { shape: [1.5, 2] })).not.toBe('');
    });

    test('accepts a valid string, object and tuple variant', () => {
      expect(() => run({ shape: 'none' })).not.toThrow();
      expect(() => run({ shape: { street: 's', floor: 2 } })).not.toThrow();
      expect(() => run({ shape: [1, 2.5] })).not.toThrow();
    });
  });
});

describe('upsert create half is unchanged', () => {
  test('still refuses a fraction in create', () => {
    expect(() => compileUpsert(item, { where: { id: 'a' }, create: { pair: [1.5, 2] } })).toThrow();
  });
});
