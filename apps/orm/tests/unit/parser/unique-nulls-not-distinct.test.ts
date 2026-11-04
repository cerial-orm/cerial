/**
 * Unit Tests: @unique(nullsNotDistinct) and @@unique(name, [..], nullsNotDistinct)
 *
 * The SurrealDB 4.0 UNIQUE NULLS NOT DISTINCT surface, through the parser, the registry and the TS builder.
 */

import { describe, expect, test } from 'bun:test';
import { createChain, f } from '../../../src/parser/builder';
import { model, modelNode } from '../../../src/parser/builder/model';
import { parseDecorators } from '../../../src/parser/types/model';
import { parse } from '../../../src/parser/parser';
import { parseModelRegistry } from '../../test-helpers';
import { expectRefusedLikeDispatch } from './registry/helpers';

const SOURCE = `
model User {
  id Record @id
  nickname String? @nullable @unique(nullsNotDistinct)
  tenantId Record? @nullable
  slug String? @nullable
  @@unique(tenantSlug, [tenantId, slug], nullsNotDistinct)
}
`;

describe('@unique(nullsNotDistinct) in text', () => {
  test('the unique decorator carries the word as its value', () => {
    const { ast, errors } = parse(SOURCE);
    expect(errors).toEqual([]);
    const unique = ast.models[0]!.fields.find((x) => x.name === 'nickname')!.decorators.find(
      (d) => d.type === 'unique',
    );
    expect(unique?.value).toBe('nullsNotDistinct');
  });

  test('plain @unique has no value', () => {
    const { ast } = parse('model U {\n  id Record @id\n  e Email @unique\n}\n');
    expect(ast.models[0]!.fields[1]!.decorators.find((d) => d.type === 'unique')?.value).toBeUndefined();
  });

  test('field metadata records the option; plain @unique does not', () => {
    const registry = parseModelRegistry(`${SOURCE}model P {\n  id Record @id\n  e Email @unique\n}\n`);
    expect(registry.User!.fields.find((x) => x.name === 'nickname')).toMatchObject({
      isUnique: true,
      uniqueNullsNotDistinct: true,
    });
    expect(registry.P!.fields.find((x) => x.name === 'e')!.uniqueNullsNotDistinct).toBeUndefined();
  });

  test.each([
    '@unique(foo)',
    '@unique()',
    '@unique(nullsNotDistinct, x)',
    '@unique(NullsNotDistinct)',
    '@unique(true)',
  ])('%s is refused with the accepted forms', (token) => {
    expectRefusedLikeDispatch('@unique', [token]);
  });

  test('an unknown argument reports the message naming the decorator', () => {
    const { errors } = parse('model U {\n  id Record @id\n  e String? @nullable @unique(foo)\n}\n');
    expect(errors.some((e) => e.message.includes("Invalid @unique argument 'foo'"))).toBe(true);
  });
});

describe('stray groups', () => {
  test('a second group after @unique(nullsNotDistinct) is refused', () => {
    const errors: string[] = [];
    parseDecorators('f String? @unique(nullsNotDistinct)(x)', 1, errors);
    expect(errors).toHaveLength(1);
  });
});

describe('@@unique(name, [..], nullsNotDistinct) in text', () => {
  test('sets nullsNotDistinct on the directive', () => {
    const directive = parse(SOURCE).ast.models[0]!.directives![0]!;
    expect(directive).toMatchObject({ kind: 'unique', name: 'tenantSlug', fields: ['tenantId', 'slug'] });
    expect(directive.nullsNotDistinct).toBe(true);
  });

  test('without the argument the key is absent', () => {
    const { ast } = parse('model U {\n  id Record @id\n  a String\n  b String\n  @@unique(ab, [a, b])\n}\n');
    expect('nullsNotDistinct' in ast.models[0]!.directives![0]!).toBe(false);
  });

  test('composite metadata carries the option', () => {
    const registry = parseModelRegistry(SOURCE);
    expect(registry.User!.compositeDirectives![0]!.nullsNotDistinct).toBe(true);
  });

  test('whitespace around the argument is accepted', () => {
    const { ast, errors } = parse(
      'model U {\n  id Record @id\n  a String\n  b String\n  @@unique( ab , [ a , b ] , nullsNotDistinct )\n}\n',
    );
    expect(errors).toEqual([]);
    expect(ast.models[0]!.directives![0]!.nullsNotDistinct).toBe(true);
  });

  test.each(['foo', 'NullsNotDistinct', 'nulls_not_distinct'])('a third argument %s is refused', (word) => {
    const { errors } = parse(
      `model U {\n  id Record @id\n  a String\n  b String\n  @@unique(ab, [a, b], ${word})\n}\n`,
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes(`Invalid @@unique argument '${word}'`))).toBe(true);
  });

  test('a fourth argument is refused', () => {
    const { errors } = parse(
      'model U {\n  id Record @id\n  a String\n  b String\n  @@unique(ab, [a, b], nullsNotDistinct, x)\n}\n',
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('TS builder form', () => {
  const chain = createChain('modelField', { kind: 'plain' });

  test('.unique() with no argument equals the parsed plain decorator', () => {
    const node = chain.unique().decorators();
    expect(node).toHaveLength(1);
    expect(node[0]).toMatchObject({ type: 'unique', value: undefined });
  });

  test(".unique('nullsNotDistinct') builds the same node as the parser", () => {
    const [built] = chain.unique('nullsNotDistinct').decorators();
    const parsed = parse(
      'model U {\n  id Record @id\n  n String? @nullable @unique(nullsNotDistinct)\n}\n',
    ).ast.models[0]!.fields[1]!.decorators.find((d) => d.type === 'unique')!;
    expect(built).toMatchObject({ type: 'unique', value: 'nullsNotDistinct' });
    expect((built as { value: unknown }).value).toEqual(parsed.value);
  });

  test(".unique('other') is refused at runtime", () => {
    // @ts-expect-error -- the type admits only 'nullsNotDistinct'
    expect(() => chain.unique('other')).toThrow(/nullsNotDistinct/);
  });

  test('{ unique: { nullsNotDistinct: true } } builds the flag', () => {
    const node = modelNode(
      model(
        'M',
        { a: f.string(), b: f.string() },
        { unique: { name: 'ab', fields: ['a', 'b'], nullsNotDistinct: true } },
      ),
    );
    expect(node.directives![0]!.nullsNotDistinct).toBe(true);
  });

  test('nullsNotDistinct: false is the same as absent', () => {
    const node = modelNode(
      model(
        'M',
        { a: f.string(), b: f.string() },
        { unique: { name: 'ab', fields: ['a', 'b'], nullsNotDistinct: false } },
      ),
    );
    expect('nullsNotDistinct' in node.directives![0]!).toBe(false);
  });

  test('a non-boolean flag is refused', () => {
    expect(() =>
      modelNode(
        model(
          'M',
          { a: f.string(), b: f.string() },
          // @ts-expect-error -- a string is not a boolean
          { unique: { name: 'ab', fields: ['a', 'b'], nullsNotDistinct: 'yes' } },
        ),
      ),
    ).toThrow(/true or false/);
  });

  test('the index key takes no nullsNotDistinct, in types or at runtime', () => {
    expect(() =>
      modelNode(
        model(
          'M',
          { a: f.string(), b: f.string() },
          // @ts-expect-error -- only unique has the key
          { index: { name: 'ab', fields: ['a', 'b'], nullsNotDistinct: true } },
        ),
      ),
    ).toThrow(/only applies to @@unique/);
  });

  test('the builder node equals the parser node for the directive', () => {
    const built = modelNode(
      model(
        'User',
        { tenantId: f.string(), slug: f.string() },
        { unique: { name: 'tenantSlug', fields: ['tenantId', 'slug'], nullsNotDistinct: true } },
      ),
    ).directives![0]!;
    const parsed = parse(SOURCE).ast.models[0]!.directives![0]!;
    expect({ ...built, range: 0, origin: 0 }).toEqual({ ...parsed, range: 0, origin: 0 });
  });
});
