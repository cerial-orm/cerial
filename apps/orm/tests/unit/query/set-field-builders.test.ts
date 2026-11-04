/**
 * Unit Tests: @set field writes
 *
 * SurrealDB 4.0 coerces a plain array into a set (facts: surrealdb-facts/query-semantics.test.ts),
 * so no write form wraps a @set value in a `<set>` cast. Non-set arrays are the control.
 */

import { describe, expect, test } from 'bun:test';
import { buildArrayUpdateClause, buildUpsertQuery } from '../../../src/query/builders';
import { buildCreateQuery, buildUpdateManyQuery } from '../../../src/query';
import { createCompileContext } from '../../../src/query/compile';
import { field, model } from './helpers';

const tags = field({ name: 'tags', type: 'string', isArray: true, isSet: true });
const plain = field({ name: 'plain', type: 'string', isArray: true });
const id = field({ name: 'id', type: 'record', isId: true });
const sut = model('Post', [id, field({ name: 'name' }), tags, plain]);

describe('@set writes carry no <set> cast', () => {
  test('create', () => {
    const q = buildCreateQuery(sut, { name: 'a', tags: ['x', 'x'] });
    expect(q.text).toMatch(/SET name = \$name_create_\d+, tags = \$tags_create_\d+ RETURN/);
    expect(q.text).not.toContain('<set>');
  });

  test('update set (assignment)', () => {
    const q = buildUpdateManyQuery(sut, {}, { tags: ['x'], plain: ['y'] });
    expect(q.text).toContain('tags = $');
    expect(q.text).not.toContain('<set>');
  });

  test('update push and unset use set::union and set::difference with the bare value', () => {
    const push = buildUpdateManyQuery(sut, {}, { tags: { push: 'z' } });
    expect(push.text).toMatch(/tags = set::union\(tags, \$[a-z_0-9]+\)/);

    const unset = buildUpdateManyQuery(sut, {}, { tags: { unset: 'z' } });
    expect(unset.text).toMatch(/tags = set::difference\(tags, \$[a-z_0-9]+\)/);
    expect(push.text + unset.text).not.toContain('<set>');
  });

  test('a non-set array push still uses +=', () => {
    const q = buildUpdateManyQuery(sut, {}, { plain: { push: 'z' } });
    expect(q.text).toMatch(/plain \+= \$/);
  });

  test('upsert create and update branches', () => {
    const q = buildUpsertQuery(sut, { name: 'a' }, { name: 'a', tags: ['x'] }, { tags: ['y'] }, 'after');
    expect(q.text).toContain('tags');
    expect(q.text).not.toContain('<set>');
  });

  test('buildArrayUpdateClause assignment', () => {
    const ctx = createCompileContext();
    const { clause } = buildArrayUpdateClause(ctx, 'tags', ['b', 'a'], tags);
    expect(clause).toMatch(/^tags = \$/);
  });
});
