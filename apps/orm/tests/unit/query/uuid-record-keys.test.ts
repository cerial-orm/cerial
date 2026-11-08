/**
 * Unit Tests: a record id is built with the key the target row has
 *
 * A uuid string handed to a `Record(uuid)` id, or to a foreign key that points at one, is a Uuid key everywhere
 * a record id is built: create, connect, disconnect, set, the many-to-many sync and the unique lookups. A key
 * kept as a string names a record that cannot exist, so the reference never matches the row. Id types that
 * admit a plain string keep the string, and a table that is not the target's is refused.
 */

import { describe, expect, test } from 'bun:test';
import { RecordId, StringRecordId, Uuid } from 'surrealdb';
import { buildDeleteUniqueQuery, buildDeleteUniqueWithCascade } from '../../../src/query/builders/delete-builder';
import {
  buildCreateWithNestedTransaction,
  buildUpdateWithNestedTransaction,
  extractNestedOperations,
} from '../../../src/query/builders/nested-builder';
import { buildFindUniqueQuery } from '../../../src/query/builders/select-builder';
import { buildUpdateUniqueQuery } from '../../../src/query/builders/update-builder';
import { buildUpsertIdQuery } from '../../../src/query/builders/upsert-builder';
import { transformData } from '../../../src/query/transformers';
import { validateCreateData } from '../../../src/query/validators';
import type { ModelMetadata } from '../../../src/types';
import { CerialUuid } from '../../../src/utils/cerial-uuid';
import { model, registry } from './where-create-parity/schema';

const U = '0190c3f8-6c5d-7a3a-9d3a-1e1f2a3b4c5d';
const U2 = '0190c3f8-6c5d-7a3a-9d3a-000000000002';

/** Every record id bound anywhere in the variables, however deep */
function recordIdsIn(value: unknown, found: RecordId[] = []): RecordId[] {
  if (value instanceof RecordId) found.push(value);
  else if (Array.isArray(value)) value.forEach((v) => recordIdsIn(v, found));
  else if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
    Object.values(value).forEach((v) => recordIdsIn(v, found));

  return found;
}

const keysOf = (vars: Record<string, unknown>): unknown[] => recordIdsIn(vars).map((r) => r.id);

describe('create converts a uuid string to a Uuid key', () => {
  test('the id of a Record(uuid) model', () => {
    const out = transformData({ id: U }, model('IdUuid'));
    expect((out.id as RecordId).id).toBeInstanceOf(Uuid);
    expect(String((out.id as RecordId).id)).toBe(U);
  });

  test('a foreign key to a Record(uuid) model', () => {
    for (const field of ['tId', 'optId']) {
      const out = transformData({ [field]: U }, model('FkUuid'));
      expect((out[field] as RecordId).id).toBeInstanceOf(Uuid);
    }
  });

  test('a foreign key array, with push and unset', () => {
    const m = model('FkArrUuid');
    const keys = (v: unknown): unknown[] => (v as RecordId[]).map((r) => r.id);
    expect(keys(transformData({ tIds: [U, U2] }, m).tIds).every((k) => k instanceof Uuid)).toBe(true);
    const ops = transformData({ tIds: { push: U, unset: [U2] } }, m).tIds as { push: RecordId; unset: RecordId[] };
    expect(ops.push.id).toBeInstanceOf(Uuid);
    expect(keys(ops.unset)[0]).toBeInstanceOf(Uuid);
  });

  test('the wrappers a caller can hold: CerialUuid, the SDK Uuid and an already built RecordId', () => {
    const m = model('FkUuid');
    for (const v of [
      new CerialUuid(U),
      new Uuid(U),
      new RecordId('id_uuid', new Uuid(U)),
      new RecordId('id_uuid', U),
    ]) {
      expect((transformData({ tId: v }, m).tId as RecordId).id).toBeInstanceOf(Uuid);
    }
  });

  test('the key a union of int and uuid takes from a uuid string, and an int stays an int', () => {
    expect((transformData({ tId: U }, model('FkUuidInt')).tId as RecordId).id).toBeInstanceOf(Uuid);
    expect((transformData({ tId: 5 }, model('FkUuidInt')).tId as RecordId).id).toBe(5);
  });
});

describe('create keeps the key as written where the id type is not a uuid alone', () => {
  test.each([
    ['FkStr', U],
    ['FkUnion', U],
    ['FkInt', '5'],
    ['FkRoot', U],
  ])('%s keeps %s as a string', (name, value) => {
    const out = transformData({ tId: value }, model(name));
    expect(typeof (out.tId as RecordId).id).toBe('string');
  });

  test('a string that is not a uuid stays a string on a uuid id, for the database to refuse', () => {
    expect(typeof (transformData({ id: 'nope' }, model('IdUuid')).id as RecordId).id).toBe('string');
  });

  test('a record of another table is refused naming both tables', () => {
    expect(() => transformData({ tId: new RecordId('other', U) }, model('FkUuid'))).toThrow(/other/);
    expect(() => transformData({ tId: `other:⟨${U}⟩` }, model('FkUuid'))).toThrow(/does not match/);
  });
});

describe('the unique lookups find a Record(uuid) row by its uuid string', () => {
  const idModel = model('IdUuid');
  const where = { id: U };

  test('findUnique', () => {
    const { vars } = buildFindUniqueQuery(idModel, { where }, registry);
    expect(keysOf(vars)).toEqual([expect.any(Uuid)]);
  });

  test('updateUnique', () => {
    const { vars } = buildUpdateUniqueQuery(idModel, where, { n: 2 }, 'after', undefined, undefined, registry);
    expect(keysOf(vars)[0]).toBeInstanceOf(Uuid);
  });

  test('deleteUnique, with and without the cascade', () => {
    expect(keysOf(buildDeleteUniqueQuery(idModel, U, false).vars)[0]).toBeInstanceOf(Uuid);
    const cascade = buildDeleteUniqueWithCascade(idModel, where, registry, false);
    expect(keysOf(cascade.vars).length).toBeGreaterThan(0);
    expect(keysOf(cascade.vars).every((k) => k instanceof Uuid)).toBe(true);
  });

  test('upsert by id', () => {
    const { vars } = buildUpsertIdQuery(
      idModel,
      where,
      { id: U, n: 1 },
      { n: 2 },
      'after',
      undefined,
      undefined,
      registry,
    );
    expect(keysOf(vars)[0]).toBeInstanceOf(Uuid);
  });

  test('a model whose id is a plain string keeps the string key', () => {
    const { vars } = buildFindUniqueQuery(model('IdStr'), { where: { id: U } }, registry);
    expect(keysOf(vars)).toEqual([U]);
  });

  test('a table that is not the model is refused', () => {
    expect(() => buildFindUniqueQuery(idModel, { where: { id: `other:⟨${U}⟩` } }, registry)).toThrow(/does not match/);
  });
});

describe('connect, disconnect and set bind Uuid keys', () => {
  const nested = (m: ModelMetadata, data: Record<string, unknown>) => extractNestedOperations(data, m);

  test('connect on a to-one relation, at create', () => {
    const m = model('FkUuid');
    const { cleanData, nestedOps } = nested(m, { t: { connect: U } });
    const out = buildCreateWithNestedTransaction(m, cleanData, nestedOps, registry);
    const keys = keysOf(out.vars);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k instanceof Uuid)).toBe(true);
  });

  test.each([
    ['connect', { connect: [U, U2] }],
    ['disconnect', { disconnect: [U] }],
    ['set', { set: [U, U2] }],
  ])('%s on a many-to-many relation, at update', (_name, op) => {
    const m = model('FkArrUuid');
    const { cleanData, nestedOps } = nested(m, { ts: op });
    const out = buildUpdateWithNestedTransaction(m, { id: 'a' }, cleanData, nestedOps, registry);
    const keys = recordIdsIn(out.vars).filter((r) => r.table.name === 'id_uuid');
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((r) => r.id instanceof Uuid)).toBe(true);
  });

  test('connect on a many-to-many relation to a plain-string id keeps the string', () => {
    const m = model('FkArrUnion');
    const { cleanData, nestedOps } = nested(m, { ts: { connect: [U] } });
    const out = buildCreateWithNestedTransaction(m, cleanData, nestedOps, registry);
    const keys = recordIdsIn(out.vars).filter((r) => r.table.name === 'id_union');
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((r) => typeof r.id === 'string')).toBe(true);
  });
});

describe('a StringRecordId is checked for its table and sent for the server to read', () => {
  test('an int key stays an int: the server parses `int_id:1`, JavaScript would make it the string "1"', () => {
    const value = new StringRecordId('id_int:1');
    expect(transformData({ id: value }, model('IdInt')).id).toBe(value);
    expect(transformData({ tId: value }, model('FkInt')).tId).toBe(value);
  });

  test('a StringRecordId operand reaches where unparsed and a create accepts the same value', () => {
    const value = new StringRecordId('id_int:1');
    expect(validateCreateData({ id: value }, model('IdInt')).errors).toEqual([]);
  });

  test('another table is refused', () => {
    expect(() => transformData({ id: new StringRecordId('other:1') }, model('IdInt'))).toThrow(/does not match/);
    expect(() => transformData({ tId: new StringRecordId('other:1') }, model('FkInt'))).toThrow(/does not match/);
  });
});
