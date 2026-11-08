/**
 * Unit Tests: geometry list operands and unparseable duration, bytes and geometry operands
 *
 * A list operator converts each member of a geometry list, whatever form it takes, and a single bare
 * point stays one value. An operand the SDK cannot parse is refused naming the field, never by the SDK.
 */

import { describe, expect, test } from 'bun:test';
import { Geometry, GeometryPoint } from 'surrealdb';
import {
  convertModels,
  convertObjects,
  convertTuples,
  createTupleRegistry,
  resolveObjectFields,
} from '../../../src/generators/metadata';
import { createObjectRegistry, createRegistry } from '../../../src/generators/metadata/registry-generator';
import { parse } from '../../../src/parser/parser';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import { buildConditions } from '../../../src/query/filters/condition-builder';
import { validateWhere } from '../../../src/query/validators';
import type { WhereClause } from '../../../src/types';
import { CerialPoint } from '../../../src/utils/cerial-geometry';

const schema = `
model Spot {
  id Record @id
  geo Geometry? @point
  du Duration?
  blob Bytes?
  kits Relation[] @model(Kit)
}

model Kit {
  id Record @id
  spotId Record?
  spot Relation? @field(spotId) @model(Spot)
}
`;

const { ast } = parse(schema);
const models = convertModels(ast.models);
const objects = convertObjects(ast.objects);
const tuples = convertTuples(ast.tuples);
resolveObjectFields(models, objects, createObjectRegistry(objects), createTupleRegistry(tuples));
const registry = createRegistry(models);
const spot = registry.Spot!;
const kit = registry.Kit!;

const w = (value: unknown): WhereClause => value as WhereClause;
const varsOf = (where: unknown): unknown[] =>
  Object.values(buildConditions(createCompileContext(), w(where), spot, registry).vars);
const asGeoJson = (v: unknown): unknown => (v instanceof Geometry ? v.toJSON() : v);
const point = (x: number, y: number) => ({ type: 'Point', coordinates: [x, y] });

describe('geometry list operands convert member by member', () => {
  const forms: [string, unknown[]][] = [
    [
      'bare pairs',
      [
        [1, 1],
        [2, 2],
      ],
    ],
    ['GeoJSON objects', [point(1, 1), point(2, 2)]],
    ['Cerial wrappers', [new CerialPoint([1, 1]), new CerialPoint([2, 2])]],
    ['a mix', [[1, 1], point(2, 2), new CerialPoint([3, 3])]],
  ];

  test.each(forms)('in and notIn with %s bind SDK geometries', (_name, list) => {
    for (const op of ['in', 'notIn']) {
      const [bound] = varsOf({ geo: { [op]: list } }) as unknown[][];
      expect(bound).toHaveLength(list.length);
      for (const member of bound!) expect(member).toBeInstanceOf(GeometryPoint);
    }
  });

  test('the bound members carry the coordinates that were sent', () => {
    const [bound] = varsOf({ geo: { notIn: [point(2, 2)] } }) as unknown[][];
    expect(bound!.map(asGeoJson)).toEqual([point(2, 2)]);
  });

  test('an empty list stays an empty list', () => {
    expect(varsOf({ geo: { in: [] } })).toEqual([[]]);
  });

  test('a single bare point on eq, neq and the shorthand is one value', () => {
    for (const where of [{ geo: [1, 2] }, { geo: { eq: [1, 2] } }, { geo: { neq: [1, 2] } }]) {
      const [bound] = varsOf(where);
      expect(bound).toBeInstanceOf(GeometryPoint);
      expect(asGeoJson(bound)).toEqual(point(1, 2));
    }
  });

  test('a relation sub-filter converts a list the same way', () => {
    const result = buildConditions(
      createCompileContext(),
      w({ spot: { geo: { notIn: [point(2, 2), new CerialPoint([3, 3])] } } }),
      kit,
      registry,
    );
    const [bound] = Object.values(result.vars) as unknown[][];
    expect(bound!.map(asGeoJson)).toEqual([point(2, 2), point(3, 3)]);
  });
});

describe('unparseable operands are refused naming the field', () => {
  const errorsOf = (where: unknown, model = spot): string[] =>
    validateWhere(w(where), model, registry).errors.map((e) => e.message);

  test.each([
    ['gt', { du: { gt: 'abc' } }],
    ['eq', { du: { eq: 'abc' } }],
    ['shorthand', { du: 'abc' }],
    ['in', { du: { in: ['1h', 'abc'] } }],
  ])('a malformed duration on %s', (_name, where) => {
    const found = errorsOf(where).join('\n');
    expect(found).toContain('Field "du');
    expect(found).toContain('not a valid duration');
  });

  test('a malformed duration in a relation sub-filter names the path', () => {
    const found = errorsOf({ spot: { du: { gt: 'abc' } } }, kit).join('\n');
    expect(found).toContain('Field "du"');
    expect(found).toContain('not a valid duration');
  });

  test('a valid duration passes', () => {
    expect(errorsOf({ du: { gt: '1h30m' } })).toEqual([]);
  });

  test('an unparseable geometry member is refused', () => {
    const found = errorsOf({ geo: { in: [{ type: 'Nope', coordinates: [] }] } }).join('\n');
    expect(found).toContain('geo[0]');
    expect(found).toContain('not a valid geometry');
  });

  test('a valid geometry list passes', () => {
    expect(errorsOf({ geo: { in: [point(1, 1), [2, 2]] } })).toEqual([]);
  });
});
