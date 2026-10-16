/**
 * Compile-only matrix: every public query method crossed with every option that accepts a key,
 * for every model in the registry, fed keys that no model declares.
 *
 * The cases are generated from the registry and the method table, so a new model or relation is
 * covered without an edit. The method table is checked against the Model class, so a new public
 * method fails the guard until it is added here. Each case passes only if the call throws an error
 * naming the key and the model, or, for an object field that accepts undeclared keys, the compiled
 * text holds the key only inside a backtick-quoted span.
 *
 * The same keys are fired at a live database in tests/e2e/negative/unknown-key-survival.test.ts.
 */

import { describe, expect, test } from 'bun:test';
import { Model } from '../../../src/client/model/model';
import {
  compileCount,
  compileCreate,
  compileDeleteMany,
  compileDeleteUnique,
  compileExists,
  compileFindMany,
  compileFindOne,
  compileFindUnique,
  compileUpdateMany,
  compileUpdateUnique,
  compileUpsert,
} from '../../../src/query/builder';
import type { FieldMetadata, ModelMetadata, ModelRegistry } from '../../../src/types';
import { registry } from './select-validation-helpers';

type Options = Record<string, unknown>;
type Compile = (model: ModelMetadata, options: Options, registry: ModelRegistry) => unknown;

interface Method {
  readonly compile: Compile;
  /** Option keys of this method that take identifiers */
  readonly slots: readonly Slot[];
  /** Options the call needs to reach compilation at all */
  readonly base: (model: ModelMetadata) => Options;
}

type Slot =
  | 'where'
  | 'select'
  | 'orderBy'
  | 'data'
  | 'unset'
  | 'include'
  | 'includeWhere'
  | 'includeOrderBy'
  | 'includeSelect'
  | 'create'
  | 'update';

const idWhere = { id: 'abc' };

/** A value of the right shape for a field, built from its metadata so a new model needs no edit here. */
function sampleValue(field: Pick<FieldMetadata, 'type' | 'objectInfo' | 'tupleInfo' | 'isArray'>): unknown {
  const one = ((): unknown => {
    switch (field.type) {
      case 'email':
        return 'a@b.co';
      case 'int':
      case 'float':
      case 'number':
        return 1;
      case 'bool':
        return true;
      case 'date':
        return new Date('2026-01-01T00:00:00Z');
      case 'object':
        return sampleObject(field.objectInfo?.fields ?? []);
      case 'tuple':
        return (field.tupleInfo?.elements ?? []).map((e) =>
          e.type === 'object' ? sampleObject(e.objectInfo?.fields ?? []) : sampleValue({ type: e.type }),
        );
      default:
        return 'x';
    }
  })();

  return field.isArray ? [one] : one;
}

function sampleObject(fields: readonly FieldMetadata[]): Record<string, unknown> {
  return Object.fromEntries(
    fields.filter((f) => f.isRequired && f.type !== 'relation').map((f) => [f.name, sampleValue(f)]),
  );
}

function sampleCreate(model: ModelMetadata): Record<string, unknown> {
  return sampleObject(model.fields.filter((f) => !f.isId));
}

const METHODS: Record<string, Method> = {
  findOne: {
    compile: (m, o, r) => compileFindOne(m, o as never, r),
    slots: ['where', 'select', 'orderBy', 'include', 'includeWhere', 'includeOrderBy', 'includeSelect'],
    base: () => ({}),
  },
  findMany: {
    compile: (m, o, r) => compileFindMany(m, o as never, r),
    slots: ['where', 'select', 'orderBy', 'include', 'includeWhere', 'includeOrderBy', 'includeSelect'],
    base: () => ({}),
  },
  findUnique: {
    compile: (m, o, r) => compileFindUnique(m, o as never, r),
    slots: ['where', 'select', 'include', 'includeWhere', 'includeOrderBy', 'includeSelect'],
    base: () => ({ where: idWhere }),
  },
  create: {
    compile: (m, o, r) => compileCreate(m, o as never, r),
    slots: ['data', 'select'],
    base: () => ({ data: {} }),
  },
  updateMany: {
    compile: (m, o, r) => compileUpdateMany(m, o as never, r),
    slots: ['where', 'data', 'unset', 'select', 'include'],
    base: () => ({ where: idWhere, data: {} }),
  },
  updateUnique: {
    compile: (m, o, r) => compileUpdateUnique(m, o as never, r),
    slots: ['where', 'data', 'unset', 'select', 'include'],
    base: () => ({ where: idWhere, data: {} }),
  },
  deleteMany: {
    compile: (m, o, r) => compileDeleteMany(m, o as never, r),
    slots: ['where'],
    base: () => ({ where: idWhere }),
  },
  deleteUnique: {
    compile: (m, o, r) => compileDeleteUnique(m, o as never, r),
    slots: ['where'],
    base: () => ({ where: idWhere }),
  },
  count: {
    compile: (m, o, r) => compileCount(m, o.where as never, r),
    slots: ['where'],
    base: () => ({}),
  },
  exists: {
    compile: (m, o, r) => compileExists(m, o.where as never, r),
    slots: ['where'],
    base: () => ({}),
  },
  upsert: {
    compile: (m, o, r) => compileUpsert(m, o as never, r),
    slots: ['where', 'create', 'update', 'unset', 'select'],
    base: (m) => ({ where: idWhere, create: sampleCreate(m), update: {} }),
  },
};

/** Public prototype members of Model that do not run a query */
const NOT_QUERY_METHODS = new Set([
  'constructor',
  'beforeQuery',
  'run',
  'resolveDb',
  'getMetadata',
  'getName',
  'getTableName',
]);

/** Keys no model declares; the second set is syntax-shaped, and is just a longer name to the validator. */
const UNKNOWN_KEYS = ['not_a_field', "it's", 'semi;colon', 'back`tick', 'ключ'];

/** One relation field per model that has any, so include slots exist exactly where the registry has relations. */
function relationOf(model: ModelMetadata) {
  return (
    model.fields.find((f) => f.type === 'relation' && f.relationInfo && !f.relationInfo.isReverse) ??
    model.fields.find((f) => f.type === 'relation' && f.relationInfo)
  );
}

/** Build the options for one slot, or null when the model has no field the slot needs. */
function optionsFor(slot: Slot, key: string, model: ModelMetadata): Options | null {
  const relation = relationOf(model);

  switch (slot) {
    case 'where':
      return { where: { [key]: 'x' } };
    case 'select':
      return { select: { [key]: true } };
    case 'orderBy':
      return { orderBy: { [key]: 'asc' } };
    case 'data':
      return { data: { [key]: 'x' } };
    case 'unset':
      return { unset: { [key]: true } };
    case 'create':
      return { create: { [key]: 'x' } };
    case 'update':
      return { update: { [key]: 'x' } };
    case 'include':
      return { include: { [key]: true } };
    case 'includeWhere':
      return relation ? { include: { [relation.name]: { where: { [key]: 'x' } } } } : null;
    case 'includeOrderBy':
      return relation ? { include: { [relation.name]: { orderBy: { [key]: 'asc' } } } } : null;
    case 'includeSelect':
      return relation ? { include: { [relation.name]: { select: { [key]: true } } } } : null;
  }
}

/** The model the refusal names: an include option is checked against the related model. */
function modelNamed(slot: Slot, model: ModelMetadata): string {
  if (!slot.startsWith('include') || slot === 'include') return model.name;

  return relationOf(model)!.relationInfo!.targetModel;
}

/** Remove backtick-quoted spans, escapes included, so only unquoted query text is left. */
function unquoted(text: string): string {
  return text.replace(/`(?:\\.|[^`\\])*`/g, '``');
}

describe('method table', () => {
  test('lists every query method of the Model class, and nothing else', () => {
    const onClass = Object.getOwnPropertyNames(Model.prototype).filter((name) => !NOT_QUERY_METHODS.has(name));

    expect(onClass.sort()).toEqual(Object.keys(METHODS).sort());
  });
});

describe('unknown keys are refused by name at every option of every method', () => {
  for (const model of Object.values(registry)) {
    for (const [methodName, method] of Object.entries(METHODS)) {
      for (const slot of method.slots) {
        test.each(UNKNOWN_KEYS)(`${model.name}.${methodName} ${slot}: %j`, (key) => {
          const options = optionsFor(slot, key, model);
          if (!options) return;

          let thrown: unknown;
          let text = '';
          try {
            const compiled = method.compile(model, { ...method.base(model), ...options }, registry) as {
              query: { text: string };
            };
            text = compiled.query.text;
          } catch (error) {
            thrown = error;
          }

          // include.select is type-level only: the runtime ignores it, so the key must simply not reach the text
          if (slot === 'includeSelect' && !thrown) return expect(unquoted(text)).not.toContain(key);

          expect(thrown).toBeInstanceOf(Error);
          expect((thrown as Error).message).toContain(key);
          expect((thrown as Error).message).toContain(modelNamed(slot, model));
        });
      }
    }
  }
});

describe('undeclared keys on a @flexible object are quoted, never bare', () => {
  const post = registry.Post!;
  const FLEX_KEYS = ["it's", 'semi;colon', 'back`tick', 'ключ', 'my-key', '2-fa'];

  const cases: Array<[string, (key: string) => Options]> = [
    ['where', (key) => ({ where: { loose: { [key]: 'x' } } })],
    ['select', (key) => ({ select: { loose: { [key]: true } } })],
    ['orderBy', (key) => ({ orderBy: { loose: { [key]: 'asc' } } })],
  ];

  for (const [slot, build] of cases) {
    test.each(FLEX_KEYS)(`findMany ${slot}: %j`, (key) => {
      const { query } = compileFindMany(post, build(key) as never, registry);

      expect(unquoted(query.text)).not.toContain(key);
      expect(query.text).toContain('`');
    });
  }

  test.each(FLEX_KEYS)('updateMany data: %j', (key) => {
    const { query } = compileUpdateMany(post, { where: idWhere, data: { loose: { [key]: 'x' } } } as never, registry);

    expect(unquoted(query.text)).not.toContain(key);
  });
});
