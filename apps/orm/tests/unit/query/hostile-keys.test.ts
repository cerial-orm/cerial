/**
 * Unit Tests: hostile identifiers as keys never reach compiled query text
 *
 * @flexible sub-keys are deliberately excluded: they are accepted by design.
 */

import { describe, expect, test } from 'bun:test';
import {
  compileCreate,
  compileFindMany,
  compileFindOne,
  compileUpdateMany,
  compileUpdateUnique,
  compileUpsert,
} from '../../../src/query/builder';
import { post, registry } from './select-validation-helpers';

const HOSTILE_KEYS = [
  'title; DROP TABLE post; --',
  "title' OR '1'='1",
  '`title`',
  'title[0]',
  'title.id',
  '../title',
  ' ',
  '',
  'tіtle', // Cyrillic 'і' (U+0456), not the Latin 'i'
  'title​', // zero-width space
];

const base = { title: 'T', authorId: 'author:1', address: { city: 'c', geo: { lat: 1, lng: 2 } } };
const loose = { city: 'c', geo: { lat: 1, lng: 2 } };
const createData = { ...base, loose, spot: ['l', { lat: 1, lng: 2 }] };

describe.each(HOSTILE_KEYS)('key %j', (key) => {
  const unknown = (prefix: string, path = key) => `${prefix}: Unknown field '${path}' on model Post`;
  const hostile = { [key]: 'x' } as never;
  const flag = { [key]: true } as never;

  test('create data', () => {
    expect(() => compileCreate(post, { data: { ...createData, [key]: 'x' } } as never, registry)).toThrow(
      unknown('Invalid data'),
    );
  });

  test('updateMany data', () => {
    expect(() => compileUpdateMany(post, { where: { id: 'post:1' }, data: hostile }, registry)).toThrow(
      unknown('Invalid data'),
    );
  });

  test('updateUnique data', () => {
    expect(() => compileUpdateUnique(post, { where: { id: 'post:1' }, data: hostile }, registry)).toThrow(
      unknown('Invalid data'),
    );
  });

  test('upsert create and update data', () => {
    expect(() =>
      compileUpsert(
        post,
        { where: { id: 'post:1' }, create: { ...createData, [key]: 'x' }, update: { title: 'U' } } as never,
        registry,
      ),
    ).toThrow(unknown('Invalid create data'));
    expect(() =>
      compileUpsert(post, { where: { id: 'post:1' }, create: createData, update: hostile } as never, registry),
    ).toThrow(unknown('Invalid update data'));
  });

  test('select', () => {
    expect(() => compileFindMany(post, { select: flag }, registry)).toThrow(unknown('Invalid select'));
    expect(() => compileFindOne(post, { select: flag }, registry)).toThrow(unknown('Invalid select'));
  });

  test('select strict object sub-key', () => {
    expect(() => compileFindMany(post, { select: { address: flag } } as never, registry)).toThrow(
      unknown('Invalid select', `address.${key}`),
    );
  });

  test('orderBy', () => {
    expect(() => compileFindMany(post, { orderBy: { [key]: 'asc' } } as never, registry)).toThrow(
      unknown('Invalid orderBy'),
    );
  });

  test('orderBy strict object sub-key', () => {
    expect(() => compileFindMany(post, { orderBy: { address: { [key]: 'asc' } } } as never, registry)).toThrow(
      unknown('Invalid orderBy', `address.${key}`),
    );
  });

  test('include', () => {
    expect(() => compileFindMany(post, { include: flag }, registry)).toThrow(unknown('Invalid include'));
  });

  test('where at top level', () => {
    expect(() => compileFindMany(post, { where: hostile }, registry)).toThrow(
      `Invalid where clause: Unknown field: ${key}`,
    );
  });

  test('where strict object sub-key', () => {
    expect(() => compileFindMany(post, { where: { address: hostile } }, registry)).toThrow(
      unknown('Invalid where clause', `address.${key}`),
    );
  });
});

describe('declared field names still compile', () => {
  test('declared fields are accepted in where, select and orderBy', () => {
    const { query } = compileFindMany(
      post,
      { where: { authorId: 'author:1' }, select: { title: true }, orderBy: { title: 'asc' } },
      registry,
    );
    expect(query.text).toContain('authorId');
    expect(query.text).toContain('ORDER BY title ASC');
  });
});
