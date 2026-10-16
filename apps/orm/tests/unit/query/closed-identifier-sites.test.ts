/**
 * Unit tests for the identifier sites that reached query text unchecked: the keys of a nested
 * reverse create, the direction under a @flexible orderBy key, and the id part of a record id.
 * Each has a refusal case that names the input and a case showing the legitimate use still works.
 */

import { describe, expect, test } from 'bun:test';
import type { RecordId } from 'surrealdb';
import {
  compileCreate,
  compileDeleteUnique,
  compileFindMany,
  compileFindUnique,
  compileUpdateUnique,
  compileUpsert,
} from '../../../src/query/builder';
import { post, registry } from './select-validation-helpers';

const author = registry.Author!;
const authorData = { name: 'A' };
const postData = { title: 't', address: { city: 'c', geo: { lat: 1, lng: 2 } } };

describe('nested reverse create keys', () => {
  test.each(['not_a_field', "it's", 'a;b', 'a b', 'ключ'])('refuses the undeclared key %j by name', (key) => {
    expect(() =>
      compileCreate(author, { data: { ...authorData, posts: { create: { ...postData, [key]: 1 } } } }, registry),
    ).toThrow(`Unknown field '${key}' on model Post`);
  });

  test('a declared key still writes, as a plain column assignment', () => {
    const { query } = compileCreate(author, { data: { ...authorData, posts: { create: postData } } }, registry);

    expect(query.text).toContain('CREATE ONLY post SET');
    expect(query.text).toContain('title = $rev_0_0_title');
  });

  test('an item in a create array is checked too', () => {
    expect(() =>
      compileCreate(
        author,
        {
          data: {
            ...authorData,
            posts: { create: [postData, { ...postData, not_a_field: 1 }] },
          },
        },
        registry,
      ),
    ).toThrow("Unknown field 'not_a_field' on model Post");
  });
});

describe('orderBy direction under a @flexible object', () => {
  test.each(['sideways', 'asc desc', 'asc;', '', 1, null])('refuses direction %j on an undeclared sub-key', (dir) => {
    expect(() => compileFindMany(post, { orderBy: { loose: { anything: dir } } } as never, registry)).toThrow(
      /Order direction for 'loose\.anything' must be 'asc' or 'desc'/,
    );
  });

  test('refuses a bad direction at a deeper undeclared level', () => {
    expect(() => compileFindMany(post, { orderBy: { loose: { a: { b: 'sideways' } } } } as never, registry)).toThrow(
      /Order direction for 'loose\.a\.b'/,
    );
  });

  test('refuses a bad direction inside include.orderBy', () => {
    expect(() =>
      compileFindMany(
        author,
        { include: { posts: { orderBy: { loose: { anything: 'sideways' } } } } } as never,
        registry,
      ),
    ).toThrow(/Order direction for 'loose\.anything'/);
  });

  test.each(['asc', 'desc', 'ASC', 'Desc'])('an undeclared sub-key with direction %j still sorts', (dir) => {
    const { query } = compileFindMany(post, { orderBy: { loose: { anything: dir } } } as never, registry);

    expect(query.text).toContain(`ORDER BY loose.anything ${dir.toUpperCase()}`);
  });

  test('a non-identifier sub-key is still quoted and sorts', () => {
    const { query } = compileFindMany(post, { orderBy: { loose: { 'my-key': 'asc' } } } as never, registry);

    expect(query.text).toContain('ORDER BY loose.`my-key` ASC');
  });

  test('include.orderBy with a valid direction on an undeclared sub-key still compiles', () => {
    const { query } = compileFindMany(
      author,
      { include: { posts: { orderBy: { loose: { anything: 'desc' } } } } } as never,
      registry,
    );

    expect(query.text).toContain('loose.anything DESC');
  });
});

describe('record id text is bound, never interpolated', () => {
  const ids = [
    'plain',
    'with\\backslash',
    'ends\\',
    'close⟩bracket',
    'back\\⟩both',
    "quo'te",
    'a"b',
    'semi;colon',
    '12',
    '',
  ];

  const idOf = (vars: Record<string, unknown>, name: string): unknown => (vars[name] as RecordId).id;

  test.each(ids.filter((id) => id))('findUnique binds %j and round-trips it', (id) => {
    const { query } = compileFindUnique(post, { where: { id } }, registry);

    expect(query.text).toContain('FROM ONLY $rid_record_id_0');
    if (id.length > 2) expect(query.text).not.toContain(id);
    expect(idOf(query.vars, 'rid_record_id_0')).toBe(id);
  });

  test.each(ids.filter((id) => id))('updateUnique binds %j', (id) => {
    const { query } = compileUpdateUnique(post, { where: { id }, data: { title: 'x' } }, registry);

    expect(query.text).toContain('UPDATE ONLY $rid_record_id_0');
    expect(idOf(query.vars, 'rid_record_id_0')).toBe(id);
  });

  test.each(ids.filter((id) => id))('updateUnique with return before binds %j in the snapshot too', (id) => {
    const { query } = compileUpdateUnique(
      post,
      { where: { id }, data: { title: 'x' }, return: 'before', select: { title: true } },
      registry,
    );

    expect(query.text).toContain('FROM $rid_record_id_0');
    expect(idOf(query.vars, 'rid_record_id_0')).toBe(id);
  });

  test.each(ids.filter((id) => id))('deleteUnique binds %j', (id) => {
    const { query } = compileDeleteUnique(post, { where: { id } }, registry);

    expect(query.text).toContain('$rid_record_id_0');
    expect(query.text).not.toContain(id.length > 2 ? id : '\u0000');
    expect(idOf(query.vars, 'rid_record_id_0')).toBe(id);
  });

  test.each(ids.filter((id) => id))('upsert binds %j on every statement that names the record', (id) => {
    const { query } = compileUpsert(author, { where: { id }, create: { name: 'n' }, update: { name: 'u' } }, registry);
    const names = Object.keys(query.vars).filter((n) => (query.vars[n] as RecordId).id === id);

    expect(names.length).toBeGreaterThan(0);
    expect(query.text).toContain(`FROM ONLY $${names[0]}`);
    expect(query.text).toContain(`UPDATE ONLY $${names[0]}`);
    expect(query.text).toContain(`CREATE ONLY $${names[0]}`);
  });

  test('a unique-field findUnique is unchanged: no record variable', () => {
    const { query } = compileFindMany(post, { where: { title: 'x' } }, registry);

    expect(Object.keys(query.vars).some((n) => n.startsWith('rid_'))).toBe(false);
  });
});
