import { describe, expect, test } from 'bun:test';
import {
  COMPOSITE_DIRECTIVE_CONSTRUCTS,
  DECLARATION_CONSTRUCTS,
  LITERAL_VARIANT_CONSTRUCTS,
  ON_DELETE_CONSTRUCTS,
  PARITY_MANIFEST,
  REGISTRY_FAMILIES,
} from '../../../../src/parity';
import * as Builder from '../../../../src/parser/builder';
import {
  e,
  enum as enumeration,
  f,
  literal,
  model,
  modelNode,
  object,
  optionEntries,
  tuple,
  bareName,
  fieldNode,
} from '../../../../src/parser/builder';
import {
  BUILDER_METHODS,
  DECLARATION_METHODS,
  LITERAL_VARIANT_METHODS,
} from '../../../../src/parser/builder/method-table';
import type { BuilderMethod } from '../../../../src/parser/builder/method-table';
import { extendsOf } from '../../../../src/parser/builder';

const Parent = {
  model: model('MtModel', { name: f.string() }),
  object: object('MtObject', {}),
  tuple: tuple('MtTuple', []),
  enum: enumeration('MtEnum', ['A']),
  literal: literal('MtLiteral', []),
};

// One builder of each kind to resolve a method against.
const probes: Record<string, object> = {
  field: f.string(),
  relation: f.relation('MtModel'),
  reverse: f.reverse('MtModel'),
  element: e.string(),
  ...Parent,
  filtered: Parent.model.pick('name'),
};
const chainProbes = ['field', 'relation', 'reverse', 'element'];

const has = (target: object, key: string): boolean => Reflect.has(target, key);

/** The builder behind `{ key }@kind`: a declaration of that kind written with the options key. */
function usesOption(key: string, kind: string): boolean {
  if (kind === 'model' && key === 'abstract')
    return modelNode(model('MtAbstract', {}, { abstract: true })).abstract === true;
  if (key === 'extends') {
    const child =
      kind === 'model'
        ? model('MtChild', {}, { extends: Parent.model })
        : kind === 'object'
          ? object('MtChild', {}, { extends: Parent.object })
          : kind === 'tuple'
            ? tuple('MtChild', [], { extends: Parent.tuple })
            : kind === 'enum'
              ? enumeration('MtChild', [], { extends: Parent.enum })
              : literal('MtChild', [], { extends: Parent.literal });

    return extendsOf(child) !== undefined;
  }

  return optionEntries('model').some((entry) => bareName(entry.name) === key);
}

function resolves(route: string): boolean {
  const braces = /^\{ (\w+) \}(?:@(\w+))?$/.exec(route);
  if (braces) return usesOption(braces[1]!, braces[2] ?? 'model');

  const method = /^(!?)\.(\w+)(?:@(\w+))?$/.exec(route);
  if (method) {
    const [, absent, key, probe] = method;
    const targets = probe ? [probes[probe]] : chainProbes.map((name) => probes[name]);
    if (targets.some((target) => !target)) return false;
    const found = targets.some((target) => typeof Reflect.get(target!, key!) === 'function');

    return absent ? !found && !targets.some((target) => has(target!, key!)) : found;
  }

  const [head, ...rest] = route.split('.');
  const root: unknown = Reflect.get(Builder, head!);
  if (!rest.length) return root !== undefined;

  return typeof Reflect.get(root as object, rest.join('.')) === 'function';
}

function routeOf(method: BuilderMethod): string | undefined {
  if (typeof method === 'string') return method;

  return 'path' in method ? method.path : undefined;
}

describe('builder method table', () => {
  const entries = Object.entries(BUILDER_METHODS);

  test('has exactly one row per manifest entry', () => {
    expect(entries.map(([id]) => id).sort()).toEqual(PARITY_MANIFEST.map((entry) => entry.id as string).sort());
  });

  test('every row resolves against the real builder', () => {
    const stale = entries.flatMap(([id, method]) => {
      const route = routeOf(method);

      return route !== undefined && !resolves(route) ? [`${id}: ${route}`] : [];
    });

    expect(stale).toEqual([]);
  });

  test('a stale route is caught by the resolver', () => {
    for (const route of [
      'f.nope',
      '.nope',
      '.optional@element',
      '!.array@field',
      'nope',
      '{ nope }@model',
      '.pick@field',
    ]) {
      expect(resolves(route)).toBe(false);
    }
  });

  test('a row that says how, or that is outside the builder, states a reason', () => {
    for (const [_id, method] of entries) {
      if (typeof method === 'string') continue;
      expect(('how' in method ? method.how : method.outside).length).toBeGreaterThan(10);
    }
  });

  test('registry rows come from the registry, not from this table', () => {
    const families: readonly string[] = REGISTRY_FAMILIES;
    const inReach = PARITY_MANIFEST.filter((entry) => families.includes(entry.family) && !('outOfReach' in entry));

    expect(inReach.length).toBeGreaterThan(40);
    for (const entry of inReach) expect(BUILDER_METHODS[entry.id]).toBeDefined();
    // `@model` has no public method, so its row says it is reached through the relation factory
    expect(BUILDER_METHODS['decorator.model']).toMatchObject({ path: 'f.relation' });
    expect(BUILDER_METHODS['decorator.field']).toBe('.field@relation');
    expect(BUILDER_METHODS['directive.index']).toBe('{ index }');
    expect(BUILDER_METHODS['type.string']).toBe('f.string');
    expect(BUILDER_METHODS['recordid.untyped']).toBe('f.record');
  });

  test('the reference rows route to the factory that yields that kind of field', () => {
    const rows = {
      'ref.object': 'object',
      'ref.tuple': 'tuple',
      'ref.literal': 'literal',
      'ref.enum': 'literal',
    } as const;
    const factories = { 'ref.object': f.object, 'ref.tuple': f.tuple, 'ref.literal': f.literal, 'ref.enum': f.enum };

    for (const [id, type] of Object.entries(rows)) {
      const row = BUILDER_METHODS[id as keyof typeof rows];
      const route = routeOf(row)!;
      const factory = factories[id as keyof typeof factories];

      expect(resolves(route)).toBe(true);
      expect(Reflect.get(f, route.replace('f.', ''))).toBe(factory);
      expect(fieldNode(factory('X'), 'x').type).toBe(type);
    }
    expect(fieldNode(f.tuple('X'), 'x').tupleName).toBe('X');
  });

  test('every row outside the builder is listed', () => {
    const outside = entries.filter(([, method]) => typeof method === 'object' && 'outside' in method).map(([id]) => id);

    expect(outside.sort()).toEqual([
      'array.optional-rejected',
      'config.client-class-name',
      'config.config-fields',
      'config.discovery',
      'validation.extends-raw-ast',
      'validation.parser-validate-schema',
      'validation.resolved-types',
      'validation.schema-resolved',
    ]);
  });
});

describe('AST-keyed families agree with the parity cross-check', () => {
  test('every literal variant kind routes through the variant factory its row names', () => {
    for (const [kind, id] of Object.entries(LITERAL_VARIANT_CONSTRUCTS)) {
      expect(BUILDER_METHODS[id]).toBe(LITERAL_VARIANT_METHODS[kind as keyof typeof LITERAL_VARIANT_METHODS]);
    }
  });

  test('every composite directive kind is an options key on a model', () => {
    for (const [kind, id] of Object.entries(COMPOSITE_DIRECTIVE_CONSTRUCTS)) {
      expect(BUILDER_METHODS[id]).toBe(`{ ${kind} }`);
    }
  });

  test('every declaration kind routes to its declaration function', () => {
    for (const [key, id] of Object.entries(DECLARATION_CONSTRUCTS)) {
      expect(BUILDER_METHODS[id]).toBe(DECLARATION_METHODS[key as keyof typeof DECLARATION_METHODS]);
    }
  });

  test('every onDelete action is accepted by a relation builder', () => {
    for (const [action, id] of Object.entries(ON_DELETE_CONSTRUCTS)) {
      expect(BUILDER_METHODS[id]).toMatchObject({ path: '.onDelete@relation' });
      const relation = f.relation('MtModel').optional() as unknown as { onDelete(action: string): unknown };
      expect(() => relation.onDelete(action)).not.toThrow();
    }
  });
});
