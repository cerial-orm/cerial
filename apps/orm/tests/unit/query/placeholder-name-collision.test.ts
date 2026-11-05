/**
 * Unit Tests: placeholder names stay unique across where contexts
 *
 * A model field named `inc_title` bound `$inc_title_eq_0` in the main where, the same name the
 * include context gave its `title` filter, so one value replaced the other.
 */

import { describe, expect, test } from 'bun:test';
import { buildFindManyQuery } from '../../../src/query/builders';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import { author, registry } from './relation-order-by-helpers';

describe('placeholder name collision', () => {
  test('a field named like an include name binds under a different placeholder', () => {
    const main = createCompileContext().bind('inc_title', 'eq', 'priv', 'string');
    const inc = createCompileContext('inc_').bind('title', 'eq', 'pub', 'string');

    expect(main.placeholder).not.toBe(inc.placeholder);
    expect(Object.keys(main.vars)).not.toEqual(Object.keys(inc.vars));
  });

  test('findMany binds each value under its own name', () => {
    const wide = {
      ...author,
      fields: [...author.fields, { ...author.fields.find((f) => f.name === 'name')!, name: 'inc_name' }],
    };
    const { text, vars } = buildFindManyQuery(
      wide,
      { where: { inc_name: 'priv' }, include: { posts: { where: { title: 'pub' } } } } as never,
      registry,
    );
    const names = [...text.matchAll(/\$([a-z_0-9]+)/g)].map((m) => m[1]!).filter((n) => n in vars);

    expect(new Set(names).size).toBe(2);
    expect(Object.values(vars).sort()).toEqual(['priv', 'pub']);
  });
});
