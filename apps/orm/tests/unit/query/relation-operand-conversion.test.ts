/**
 * Unit Tests: operands inside a relation sub-filter
 *
 * A relation sub-filter binds each operand exactly as the top-level where does: Duration, Uuid and
 * Decimal as SDK values, ids as RecordIds, dates as Dates. Bound as strings they compare against the
 * typed stored value and match the wrong rows.
 */

import { describe, expect, test } from 'bun:test';
import { DateTime, Decimal, Duration, RecordId, Uuid } from 'surrealdb';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import { buildConditions } from '../../../src/query/filters/condition-builder';
import { CerialDuration } from '../../../src/utils/cerial-duration';
import type { ModelMetadata, ModelRegistry } from '../../../src/types';
import { field, model } from './helpers';

const typed = (name: string, type: 'duration' | 'uuid' | 'decimal' | 'date') =>
  field({ name, type, isRequired: false });

const owner: ModelMetadata = {
  ...model('Owner', [
    field({ name: 'id', type: 'record', isId: true }),
    typed('du', 'duration'),
    typed('uu', 'uuid'),
    typed('de', 'decimal'),
    typed('dt', 'date'),
    field({
      name: 'kits',
      type: 'relation',
      isRequired: false,
      isArray: true,
      relationInfo: { targetModel: 'Kit', targetTable: 'kit', isReverse: true },
    }),
  ]),
};
const kit: ModelMetadata = {
  ...model('Kit', [
    field({ name: 'id', type: 'record', isId: true }),
    field({ name: 'ownerId', type: 'record', isRequired: false }),
    field({
      name: 'owner',
      type: 'relation',
      isRequired: false,
      relationInfo: { targetModel: 'Owner', targetTable: 'owner', fieldRef: 'ownerId', isReverse: false },
    }),
    typed('du', 'duration'),
  ]),
};
const registry = { Owner: owner, Kit: kit } as ModelRegistry;

const varsOf = (where: Record<string, unknown>, from: ModelMetadata = kit): unknown[] =>
  Object.values(buildConditions(createCompileContext(), where, from, registry).vars);

const U = '0190a6f2-7d5e-7c3a-9b1e-123456789000';

describe('forward relation sub-filter operands', () => {
  test.each([
    ['duration', 'du', '90m', (v: unknown) => v instanceof Duration && v.toString() === '1h30m'],
    ['uuid', 'uu', U, (v: unknown) => v instanceof Uuid && v.toString() === U],
    ['decimal', 'de', '2', (v: unknown) => v instanceof Decimal && v.toString() === '2'],
    ['date', 'dt', '2021-06-01', (v: unknown) => v instanceof DateTime || v instanceof Date],
  ])('%s binds a converted value on every operator', (_label, name, raw, ok) => {
    for (const where of [
      { [name]: raw },
      { [name]: { eq: raw } },
      { [name]: { neq: raw } },
      { [name]: { gt: raw } },
      { [name]: { gte: raw } },
      { [name]: { lt: raw } },
      { [name]: { lte: raw } },
    ]) {
      const vars = varsOf({ owner: where });
      expect(vars).toHaveLength(1);
      expect(ok(vars[0])).toBe(true);
    }
  });

  test('in, notIn and between convert every member', () => {
    for (const op of ['in', 'notIn', 'between']) {
      const vars = varsOf({ owner: { du: { [op]: ['90m', '2h'] } } });
      expect(vars).toHaveLength(op === 'between' ? 2 : 1);
      const members = op === 'between' ? vars : (vars[0] as unknown[]);
      for (const m of members) expect(m).toBeInstanceOf(Duration);
    }
  });

  test('a wrapper operand binds as the SDK value', () => {
    const [v] = varsOf({ owner: { du: { gt: new CerialDuration('90m') } } });
    expect(v).toBeInstanceOf(Duration);
  });

  test('an id operand binds as a RecordId on the target table', () => {
    const [v] = varsOf({ owner: { id: { neq: 'o1' } } });
    expect(v).toBeInstanceOf(RecordId);
    expect((v as RecordId).table.name).toBe('owner');
  });
});

describe('reverse relation sub-filter operands', () => {
  test.each(['some', 'every', 'none'])('%s converts a duration operand', (q) => {
    const [v] = varsOf({ kits: { [q]: { du: { gt: '90m' } } } }, owner);
    expect(v).toBeInstanceOf(Duration);
  });

  test('a foreign key operand binds as a RecordId on its target table', () => {
    const [v] = varsOf({ kits: { some: { ownerId: { neq: 'o1' } } } }, owner);
    expect(v).toBeInstanceOf(RecordId);
  });
});
