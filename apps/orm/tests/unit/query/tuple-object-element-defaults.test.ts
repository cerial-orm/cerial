/**
 * Unit Tests: sub-field defaults inside an object tuple element
 *
 * An object element is an inline literal type with no `DEFINE FIELD t[N].x` behind it, so
 * the database fires no default for its sub-fields. The ORM fills each omitted decorated
 * sub-field itself, at any object depth, and a value the caller supplied always wins.
 */

import { describe, expect, test } from 'bun:test';
import { Uuid } from 'surrealdb';
import { TIME_NOW } from '../../../src/query/compile/inline-expression';
import { transformData } from '../../../src/query/transformers/data-transformer';
import type { FieldMetadata, ModelMetadata, ObjectFieldMetadata } from '../../../src/types';
import { elem, field, tupleInfo } from './helpers';

const inner: ObjectFieldMetadata = {
  objectName: 'Inner',
  fields: [field({ name: 'level', type: 'int', defaultValue: 2 }), field({ name: 'kept', type: 'string' })],
};

const metaFields: FieldMetadata[] = [
  field({ name: 'n', type: 'int', defaultValue: 3 }),
  field({ name: 'at', type: 'date', timestampDecorator: 'createdAt' }),
  field({ name: 'seen', type: 'date', timestampDecorator: 'updatedAt' }),
  field({ name: 'tag', type: 'string', defaultAlwaysValue: 't' }),
  field({ name: 'v4', type: 'uuid', uuidDecorator: 'uuid4' }),
  field({ name: 'v7', type: 'uuid', uuidDecorator: 'uuid7' }),
  field({ name: 'live', type: 'date', timestampDecorator: 'now' }),
  field({ name: 'plain', type: 'string', isRequired: false }),
  field({ name: 'list', type: 'int', isArray: true, defaultValue: [1, 2] }),
  field({ name: 'child', type: 'object', objectInfo: inner }),
  field({ name: 'children', type: 'object', isArray: true, objectInfo: inner }),
];
const meta: ObjectFieldMetadata = { objectName: 'Meta', fields: metaFields };

const m: ModelMetadata = {
  name: 'Holder',
  tableName: 'holder',
  fields: [
    field({ name: 'id', type: 'record', isId: true }),
    field({
      name: 'pair',
      type: 'tuple',
      tupleInfo: tupleInfo('Pair', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'object', objectInfo: meta }),
      ]),
    }),
    field({
      name: 'maybe',
      type: 'tuple',
      isRequired: false,
      tupleInfo: tupleInfo('Maybe', [elem({ index: 0, type: 'object', isOptional: true, objectInfo: meta })]),
    }),
  ],
};

const element = (data: Record<string, unknown>): Record<string, unknown> =>
  (transformData(data, m).pair as unknown[])[1] as Record<string, unknown>;

describe('Tuple object element: omitted sub-field defaults', () => {
  const filled = element({ pair: ['a', { child: { kept: 'k' }, children: [{ kept: 'x' }, { kept: 'y', level: 9 }] }] });

  test('timestamps become time::now() text', () => {
    expect(filled.at).toBe(TIME_NOW);
    expect(filled.seen).toBe(TIME_NOW);
  });

  test('@default and @defaultAlways values are filled, arrays element by element', () => {
    expect(filled.n).toBe(3);
    expect(filled.tag).toBe('t');
    expect(filled.list).toEqual([1, 2]);
  });

  test('uuid decorators give a native uuid of the right version', () => {
    expect(filled.v4).toBeInstanceOf(Uuid);
    expect(filled.v7).toBeInstanceOf(Uuid);
    expect(String(filled.v4)[14]).toBe('4');
    expect(String(filled.v7)[14]).toBe('7');
    expect(String(filled.v4)).not.toBe(String(filled.v7));
  });

  test('a plain optional sub-field and a @now sub-field stay absent', () => {
    expect('plain' in filled).toBe(false);
    expect('live' in filled).toBe(false);
  });

  test('defaults are filled in a nested object and in every item of an object array', () => {
    expect(filled.child).toEqual({ kept: 'k', level: 2 });
    expect(filled.children).toEqual([
      { kept: 'x', level: 2 },
      { kept: 'y', level: 9 },
    ]);
  });

  test('every call draws its own uuid', () => {
    const again = element({ pair: ['a', { child: { kept: 'k' }, children: [] }] });
    expect(String(again.v7)).not.toBe(String(filled.v7));
  });
});

describe('Tuple object element: an explicit value wins', () => {
  const when = new Date('2020-01-01T00:00:00.000Z');
  const id = new Uuid('11111111-1111-4111-8111-111111111111');
  const given = element({
    pair: [
      'a',
      {
        n: 0,
        at: when,
        seen: when,
        tag: 'mine',
        v4: id,
        v7: id,
        list: [],
        child: { kept: 'k', level: 0 },
        children: [],
      },
    ],
  });

  test('falsy and empty values are kept, not replaced by the default', () => {
    expect(given.n).toBe(0);
    expect(given.list).toEqual([]);
    expect(given.child).toEqual({ kept: 'k', level: 0 });
  });

  test('timestamps, @defaultAlways and uuids the caller wrote are untouched', () => {
    expect(given.at).toEqual(when);
    expect(given.seen).toEqual(when);
    expect(given.tag).toBe('mine');
    expect(given.v4).toBe(id);
    expect(given.v7).toBe(id);
  });

  test('an explicit null is not replaced either', () => {
    const nulled = element({ pair: ['a', { n: null, child: { kept: 'k' }, children: [] }] });
    expect(nulled.n).toBeNull();
  });
});

describe('Tuple object element: where the fill does not apply', () => {
  test('an omitted optional object element stays absent', () => {
    const out = transformData({ pair: ['a', {}], maybe: [undefined] }, m).maybe as unknown[];
    expect(out[0]).toBeUndefined();
  });

  test('the object form of the tuple fills the element too', () => {
    const out = transformData({ pair: { 0: 'a', 1: { child: { kept: 'k' }, children: [] } } }, m).pair as unknown[];
    expect((out[1] as Record<string, unknown>).n).toBe(3);
  });

  test('a { set } on an element update fills the replacement object', () => {
    const out = transformData({ pair: { 1: { set: { child: { kept: 'k' }, children: [] } } } }, m, 'update');
    const set = ((out.pair as Record<string, unknown>)['1'] as { set: Record<string, unknown> }).set;
    expect(set.n).toBe(3);
    expect(set.seen).toBe(TIME_NOW);
  });

  test('a partial merge on an element update fills nothing: stored values stay', () => {
    const out = transformData({ pair: { 1: { plain: 'p' } } }, m, 'update');
    expect((out.pair as Record<string, unknown>)['1']).toEqual({ plain: 'p' });
  });
});
