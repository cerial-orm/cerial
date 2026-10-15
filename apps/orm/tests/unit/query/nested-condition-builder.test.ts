/**
 * Unit Tests: Nested Condition Builder
 *
 * Place has a forward relation `owner` (FK ownerId) to Owner; Owner has the reverse array
 * `places`. Asserts the exact fragment text and bound variables for every branch.
 *
 * The array quantifiers compile to `id [NOT] IN (SELECT VALUE fk FROM table WHERE ...)`, not to
 * `!(arr.any(...))`: that form belongs to array-of-object filters in condition-builder.ts.
 */

import { describe, expect, test } from 'bun:test';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import {
  buildForwardNestedCondition,
  buildNestedCondition,
  buildReverseNestedCondition,
  isNestedRelationCondition,
} from '../../../src/query/filters/nested-condition-builder';
import type { FieldMetadata, ModelMetadata, ModelRegistry, WhereClause } from '../../../src/types';
import { owner, place, placeRegistry } from './where-validation-helpers';

const fieldOf = (model: ModelMetadata, name: string): FieldMetadata => {
  const found = model.fields.find((f) => f.name === name);
  if (!found) throw new Error(`fixture field ${model.name}.${name} missing`);

  return found;
};

const ownerField = fieldOf(place, 'owner');
const placesField = fieldOf(owner, 'places');
const EMPTY = { text: '', vars: {} };

const forward = (where: WhereClause, registry: ModelRegistry = placeRegistry, field: FieldMetadata = ownerField) =>
  buildForwardNestedCondition(createCompileContext(), field, where, place, registry);
const reverse = (where: WhereClause, registry: ModelRegistry = placeRegistry, field: FieldMetadata = placesField) =>
  buildReverseNestedCondition(createCompileContext(), field, where, owner, registry);

const SUB = 'SELECT VALUE ownerId FROM place';

describe('buildReverseNestedCondition — quantifiers', () => {
  test('some compiles to id IN over the foreign keys of matching children', () => {
    expect(reverse({ some: { name: 'x' } })).toEqual({
      text: `id IN (${SUB} WHERE name = $name_eq_0)`,
      vars: { name_eq_0: 'x' },
    });
  });

  test('none compiles to id NOT IN over matching children, not to an arr.any() negation', () => {
    const result = reverse({ none: { name: 'x' } });

    expect(result).toEqual({
      text: `id NOT IN (${SUB} WHERE name = $name_eq_0)`,
      vars: { name_eq_0: 'x' },
    });
    expect(result.text).not.toContain('.any(');
  });

  test('every requires no non-matching child and at least one child', () => {
    expect(reverse({ every: { name: 'x' } })).toEqual({
      text: `(id NOT IN (${SUB} WHERE NOT (name = $name_eq_0)) AND id IN (${SUB}))`,
      vars: { name_eq_0: 'x' },
    });
  });

  test('several operators on one field are ANDed inside the quantifier and bound in order', () => {
    expect(reverse({ some: { name: { contains: 'a', startsWith: 'b' } } })).toEqual({
      text: `id IN (${SUB} WHERE (string::contains(name, $name_contains_0) AND string::starts_with(name, $name_startsWith_1)))`,
      vars: { name_contains_0: 'a', name_startsWith_1: 'b' },
    });
  });

  test('several fields in one quantifier are ANDed in key order', () => {
    expect(reverse({ none: { name: 'x', ownerId: 1 } })).toEqual({
      text: `id NOT IN (${SUB} WHERE name = $name_eq_0 AND ownerId = $ownerId_eq_1)`,
      vars: { name_eq_0: 'x', ownerId_eq_1: 1 },
    });
  });

  test('two quantifiers are ANDed with one shared variable counter', () => {
    expect(reverse({ some: { name: 'x' }, none: { name: 'y' } })).toEqual({
      text: `id IN (${SUB} WHERE name = $name_eq_0) AND id NOT IN (${SUB} WHERE name = $name_eq_1)`,
      vars: { name_eq_0: 'x', name_eq_1: 'y' },
    });
  });

  test('all three quantifiers together keep their order', () => {
    const { text } = reverse({ some: { name: 'a' }, every: { name: 'b' }, none: { name: 'c' } });

    expect(text).toBe(
      `id IN (${SUB} WHERE name = $name_eq_0) AND ` +
        `(id NOT IN (${SUB} WHERE NOT (name = $name_eq_1)) AND id IN (${SUB})) AND ` +
        `id NOT IN (${SUB} WHERE name = $name_eq_2)`,
    );
  });

  test.each(['some', 'every', 'none'])('%s with an empty inner where adds no condition', (quantifier) => {
    expect(reverse({ [quantifier]: {} })).toEqual(EMPTY);
  });

  test.each(['some', 'every', 'none'])('%s with an undefined value is skipped', (quantifier) => {
    expect(reverse({ [quantifier]: undefined })).toEqual(EMPTY);
  });

  test('an empty quantifier does not suppress its siblings', () => {
    expect(reverse({ some: {}, none: { name: 'y' } })).toEqual({
      text: `id NOT IN (${SUB} WHERE name = $name_eq_0)`,
      vars: { name_eq_0: 'y' },
    });
  });

  test('keys that are not quantifiers are ignored', () => {
    expect(reverse({ name: 'x' })).toEqual(EMPTY);
    expect(reverse({ name: 'x', some: { name: 'y' } }).text).toBe(`id IN (${SUB} WHERE name = $name_eq_0)`);
  });

  test('inner fields missing from the target model and undefined inner values are skipped', () => {
    expect(reverse({ some: { nope: 'x' } })).toEqual(EMPTY);
    expect(reverse({ some: { name: undefined } })).toEqual(EMPTY);
    expect(reverse({ some: { nope: 'x', name: 'y' } }).text).toBe(`id IN (${SUB} WHERE name = $name_eq_0)`);
  });

  test('an unregistered operator is dropped while a registered sibling is kept', () => {
    expect(reverse({ some: { name: { eq: 'x', bogus: 1 } } })).toEqual({
      text: `id IN (${SUB} WHERE name = $name_eq_0)`,
      vars: { name_eq_0: 'x' },
    });
  });

  test('an operator object with only undefined values adds no condition', () => {
    expect(reverse({ some: { name: { eq: undefined } } })).toEqual(EMPTY);
  });

  test('a direct value is shorthand for eq', () => {
    expect(reverse({ some: { name: 'x' } }).text).toBe(reverse({ some: { name: { eq: 'x' } } }).text);
  });
});

describe('buildReverseNestedCondition — unusable metadata', () => {
  test('a forward relation field yields no condition', () => {
    expect(reverse({ some: { name: 'x' } }, placeRegistry, ownerField)).toEqual(EMPTY);
  });

  test('a field without relationInfo yields no condition', () => {
    expect(reverse({ some: { name: 'x' } }, placeRegistry, { ...placesField, relationInfo: undefined })).toEqual(EMPTY);
  });

  test('a target model missing from the registry yields no condition', () => {
    expect(reverse({ some: { name: 'x' } }, { Owner: owner })).toEqual(EMPTY);
  });

  test('a target with no forward relation back to the source yields no condition', () => {
    const detached: ModelMetadata = { ...place, fields: place.fields.filter((f) => f.name !== 'owner') };

    expect(reverse({ some: { name: 'x' } }, { ...placeRegistry, Place: detached })).toEqual(EMPTY);
  });

  test('a back relation without a fieldRef yields no condition', () => {
    const noRef: FieldMetadata = {
      ...ownerField,
      relationInfo: { ...ownerField.relationInfo!, fieldRef: undefined },
    };
    const target: ModelMetadata = { ...place, fields: place.fields.map((f) => (f.name === 'owner' ? noRef : f)) };

    expect(reverse({ some: { name: 'x' } }, { ...placeRegistry, Place: target })).toEqual(EMPTY);
  });

  test('a reverse-flagged relation in the target is not taken as the foreign key', () => {
    const flipped: FieldMetadata = {
      ...ownerField,
      relationInfo: { ...ownerField.relationInfo!, isReverse: true },
    };
    const target: ModelMetadata = { ...place, fields: place.fields.map((f) => (f.name === 'owner' ? flipped : f)) };

    expect(reverse({ some: { name: 'x' } }, { ...placeRegistry, Place: target })).toEqual(EMPTY);
  });
});

describe('buildForwardNestedCondition', () => {
  test('a direct value compiles to eq on the dotted foreign key path', () => {
    expect(forward({ name: 'Ada' })).toEqual({
      text: 'ownerId.name = $ownerId_name_eq_0',
      vars: { ownerId_name_eq_0: 'Ada' },
    });
  });

  test('an operator object compiles through its handler on the dotted path', () => {
    expect(forward({ name: { contains: 'A' } })).toEqual({
      text: 'string::contains(ownerId.name, $ownerId_name_contains_0)',
      vars: { ownerId_name_contains_0: 'A' },
    });
  });

  test('several operators on one field are ANDed in parentheses', () => {
    expect(forward({ name: { contains: 'A', startsWith: 'B' } })).toEqual({
      text: '(string::contains(ownerId.name, $ownerId_name_contains_0) AND string::starts_with(ownerId.name, $ownerId_name_startsWith_1))',
      vars: { ownerId_name_contains_0: 'A', ownerId_name_startsWith_1: 'B' },
    });
  });

  test('several fields are ANDed without extra parentheses', () => {
    expect(forward({ name: 'A', id: 1 })).toEqual({
      text: 'ownerId.name = $ownerId_name_eq_0 AND ownerId.id = $ownerId_id_eq_1',
      vars: { ownerId_name_eq_0: 'A', ownerId_id_eq_1: 1 },
    });
  });

  test('undefined values and fields missing from the target are skipped', () => {
    expect(forward({ name: undefined })).toEqual(EMPTY);
    expect(forward({ nope: 'x' })).toEqual(EMPTY);
    expect(forward({ nope: 'x', name: 'A' }).text).toBe('ownerId.name = $ownerId_name_eq_0');
  });

  test('an unregistered operator is dropped while a registered sibling is kept', () => {
    expect(forward({ name: { eq: 'A', bogus: 1 } }).text).toBe('ownerId.name = $ownerId_name_eq_0');
  });

  test('an operator object with only undefined values adds no condition', () => {
    expect(forward({ name: { eq: undefined } })).toEqual(EMPTY);
  });

  // The forward path drops AND, OR and NOT without a trace, so a filter that relies on them
  // matches more rows than written. Pinned as current behavior; see the report on this task.
  test.each(['AND', 'OR', 'NOT'])('%s inside a forward relation filter is currently dropped', (key) => {
    expect(forward({ [key]: [{ name: 'A' }] })).toEqual(EMPTY);
    expect(forward({ [key]: [{ name: 'A' }], name: 'B' }).text).toBe('ownerId.name = $ownerId_name_eq_0');
  });

  test('a reverse relation field yields no condition', () => {
    expect(forward({ name: 'A' }, placeRegistry, placesField)).toEqual(EMPTY);
  });

  test('a field without relationInfo yields no condition', () => {
    expect(forward({ name: 'A' }, placeRegistry, { ...ownerField, relationInfo: undefined })).toEqual(EMPTY);
  });

  test('a relation without a fieldRef yields no condition', () => {
    const noRef: FieldMetadata = { ...ownerField, relationInfo: { ...ownerField.relationInfo!, fieldRef: undefined } };

    expect(forward({ name: 'A' }, placeRegistry, noRef)).toEqual(EMPTY);
  });

  test('a target model missing from the registry yields no condition', () => {
    expect(forward({ name: 'A' }, { Place: place })).toEqual(EMPTY);
  });
});

describe('buildNestedCondition — dispatch', () => {
  const dispatch = (field: FieldMetadata, model: ModelMetadata, where: WhereClause) =>
    buildNestedCondition(createCompileContext(), field, where, model, placeRegistry);

  test('a forward relation goes to the dotted-path builder', () => {
    expect(dispatch(ownerField, place, { name: 'A' })).toEqual(forward({ name: 'A' }));
  });

  test('a reverse relation goes to the quantifier builder', () => {
    expect(dispatch(placesField, owner, { none: { name: 'A' } })).toEqual(reverse({ none: { name: 'A' } }));
  });

  test('a field without relationInfo yields no condition', () => {
    expect(dispatch({ ...ownerField, relationInfo: undefined }, place, { name: 'A' })).toEqual(EMPTY);
  });
});

describe('isNestedRelationCondition', () => {
  const plain = fieldOf(place, 'name');

  test('accepts a plain object on a relation field', () => {
    expect(isNestedRelationCondition(ownerField, { name: 'A' })).toBe(true);
    expect(isNestedRelationCondition(placesField, { some: {} })).toBe(true);
  });

  test.each([
    ['null', null],
    ['an array', [1]],
    ['a string', 'x'],
    ['a number', 1],
    ['undefined', undefined],
  ])('rejects %s', (_label, value) => {
    expect(isNestedRelationCondition(ownerField, value)).toBe(false);
  });

  test('rejects a non-relation field and a relation field without relationInfo', () => {
    expect(isNestedRelationCondition(plain, { name: 'A' })).toBe(false);
    expect(isNestedRelationCondition({ ...ownerField, relationInfo: undefined }, { name: 'A' })).toBe(false);
  });
});
