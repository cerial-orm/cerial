/**
 * The generated `groupBy` types: the full emitted text for a model mixing every field kind, the fields each
 * aggregate offers (checked against the validator, so the types never offer what the runtime refuses), and the
 * method signature.
 */

import { describe, expect, test } from 'bun:test';
import { generateGroupByMethod, generateGroupByTypes } from '../../../../src/generators/types/group-by-generator';
import { validateGroupBy } from '../../../../src/query/validators/group-by-validator';
import type { FieldMetadata } from '../../../../src/types';
import { field, literalInfo, model, objectField, relationField } from '../fixtures';

const address: FieldMetadata[] = [
  field({ name: 'city' }),
  field({
    name: 'geo',
    type: 'object',
    objectInfo: { objectName: 'Geo', fields: [field({ name: 'lat', type: 'float' })] },
  }),
  field({ name: 'self', type: 'object', objectInfo: { objectName: 'Address', fields: [] } }),
];

const order = model('Order', [
  field({ name: 'id', type: 'record', isId: true }),
  field({ name: 'status', type: 'literal', literalInfo: literalInfo('Status', [], true) }),
  field({ name: 'total', type: 'decimal' }),
  field({ name: 'quantity', type: 'int', isRequired: false }),
  field({ name: 'note', isNullable: true }),
  field({ name: 'tags', isArray: true }),
  field({ name: 'blob', type: 'bytes' }),
  field({ name: 'where', type: 'geometry' }),
  { ...objectField('address', 'Address'), objectInfo: { objectName: 'Address', fields: address } },
  relationField('customer', 'Customer'),
]);

const text = generateGroupByTypes(order);

describe('generateGroupByTypes', () => {
  test('the group keys are the stored comparable fields, with declared object sub-keys nested', () => {
    expect(text).toContain(`export interface OrderGroupByKeys {
  id?: true;
  status?: true;
  total?: true;
  quantity?: true;
  note?: true;
  tags?: true;
  address?: { city?: true; geo?: { lat?: true; }; };
}`);
  });

  test('a cyclic object is not expanded into itself', () => {
    expect(text).not.toContain('self?:');
  });

  test('_sum and _avg take numeric scalars only', () => {
    expect(text).toContain('export interface OrderNumericAggregate {\n  total?: true;\n  quantity?: true;\n}');
  });

  test('_min and _max take scalars and exclude arrays', () => {
    const block = text.match(/export interface OrderMinMaxAggregate \{[^}]*\}/)![0];
    expect(block).not.toContain('tags');
    expect(block).toContain('status?: true;');
  });

  test('_group takes arrays too, _count takes every stored field and _all', () => {
    expect(text.match(/export interface OrderGroupAggregate \{[^}]*\}/)![0]).toContain('tags?: true;');
    const count = text.match(/export interface OrderCountAggregate \{[^}]*\}/)![0];
    expect(count).toContain('_all?: true;');
    expect(count).toContain('blob?: true;');
    expect(count).not.toContain('customer');
  });

  test('the args take _count as true or a field map, and a model with a numeric field gets _sum and _avg', () => {
    expect(text).toContain(`export interface OrderGroupByArgs {
  by: OrderGroupByKeys;
  where?: OrderWhere;
  _count?: true | OrderCountAggregate;
  _sum?: OrderNumericAggregate;
  _avg?: OrderNumericAggregate;
  _min?: OrderMinMaxAggregate;
  _max?: OrderMinMaxAggregate;
  _group?: OrderGroupAggregate;
  orderBy?: OrderGroupByOrderBy;
  limit?: number;
  offset?: number;
}`);
  });

  test('orderBy takes the keys and the requestable aggregates, never _group', () => {
    const block = text.match(/export interface OrderGroupByOrderBy \{[\s\S]*?\n\}/)![0];
    expect(block).toContain("address?: { city?: 'asc' | 'desc'; geo?: { lat?: 'asc' | 'desc'; }; };");
    expect(block).toContain('_count?:');
    expect(block).toContain('_avg?:');
    expect(block).not.toContain('_group');
  });

  test('result values follow the mapper: sums by field type, avg and min/max nullable, group members per nullability', () => {
    expect(text).toContain('_sum: { total: CerialDecimal; quantity: number; };');
    expect(text).toContain('_avg: { total: CerialDecimal | null; quantity: number | null; };');
    expect(text).toContain("total: NonNullable<Order['total']> | null;");
    expect(text).toContain("note: (GroupMember<Order['note']> | null)[];");
    expect(text).toContain("tags: GroupMember<Order['tags']>[];");
    expect(text).toContain("total: GroupMember<Order['total']>[];");
    expect(text).toContain('_count: { _all: number;');
    expect(text).toContain(
      'export type OrderGroupByResult<A extends OrderGroupByArgs> = GroupByRow<Order, A, OrderGroupByAggregates>;',
    );
  });

  test('an aggregate with no eligible field is left out entirely', () => {
    const plain = generateGroupByTypes(model('Tag', [field({ name: 'label' })]));
    expect(plain).not.toContain('NumericAggregate');
    expect(plain).not.toContain('_sum');
    expect(plain).not.toContain('_avg');
    expect(plain).toContain('_min?: TagMinMaxAggregate;');
  });

  test('a field named like an aggregate is not offered as a key, and a field named _all is not countable, since _all is the row count', () => {
    const odd = generateGroupByTypes(
      model('Odd', [field({ name: '_count' }), field({ name: '_all' }), field({ name: 'x' })]),
    );
    expect(odd).toContain('export interface OddGroupByKeys {\n  _all?: true;\n  x?: true;\n}');
    expect(odd).toContain('export interface OddCountAggregate {\n  _count?: true;\n  x?: true;\n}');
    expect(odd).toContain('_count: { _count: number; x: number; };');
  });
});

describe('what the types offer is what the validator accepts', () => {
  const listed = (name: string): string[] =>
    [...text.match(new RegExp(`export interface ${name} \\{([^}]*)\\}`))![1]!.matchAll(/^\s*(\w+)\?: true;/gm)].map(
      (m) => m[1]!,
    );
  const names = order.fields.filter((f) => f.type !== 'relation').map((f) => f.name);
  const problems = (args: unknown): number => validateGroupBy(args, order).length;

  test.each([
    ['OrderNumericAggregate', '_sum'],
    ['OrderNumericAggregate', '_avg'],
    ['OrderMinMaxAggregate', '_min'],
    ['OrderMinMaxAggregate', '_max'],
    ['OrderGroupAggregate', '_group'],
    ['OrderCountAggregate', '_count'],
  ])('%s as %s: every listed field passes and every other stored field is refused', (set, aggregate) => {
    const offered = listed(set).filter((n) => n !== '_all');
    for (const n of offered) expect(problems({ by: { id: true }, [aggregate]: { [n]: true } })).toBe(0);
    if (aggregate === '_count') return;
    for (const n of names.filter((x) => !offered.includes(x))) {
      expect(problems({ by: { id: true }, [aggregate]: { [n]: true } })).toBeGreaterThan(0);
    }
  });

  test('every listed group key passes the validator', () => {
    for (const n of listed('OrderGroupByKeys')) expect([n, problems({ by: { [n]: true } })]).toEqual([n, 0]);
    expect(problems({ by: { address: { city: true, geo: { lat: true } } } })).toBe(0);
    for (const n of ['blob', 'where']) expect(problems({ by: { [n]: true } })).toBeGreaterThan(0);
  });
});

describe('generateGroupByMethod', () => {
  test('is generic over the const arguments and returns rows of the narrowed result', () => {
    expect(generateGroupByMethod(order)).toBe(
      'groupBy<const A extends OrderGroupByArgs>(args: GroupByArg<A, OrderGroupByArgs>, txn?: CerialTransaction): CerialQueryPromise<OrderGroupByResult<A>[]>;',
    );
  });
});
