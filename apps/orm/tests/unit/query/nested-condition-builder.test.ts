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
import { CerialValidationError } from '../../../src/errors';
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

// A non-empty filter that compiles to nothing must raise: an empty fragment makes the caller drop its WHERE
const throwsNoConditions = (run: () => unknown, relation: string, keys: string) => {
  expect(run).toThrow(CerialValidationError);
  expect(run).toThrow(`Relation filter on ${relation} produced no conditions from ${keys}.`);
};

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

  test.each(['some', 'every', 'none'])('%s with an empty inner where, alone, raises', (quantifier) => {
    throwsNoConditions(() => reverse({ [quantifier]: {} }), 'Owner.places', `'${quantifier}'`);
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

  test('keys that are not quantifiers cannot compile and raise', () => {
    throwsNoConditions(() => reverse({ name: 'x' }), 'Owner.places', `'name'`);
    expect(reverse({ name: 'x', some: { name: 'y' } }).text).toBe(`id IN (${SUB} WHERE name = $name_eq_0)`);
  });

  test('inner fields missing from the target model and undefined inner values are skipped', () => {
    throwsNoConditions(() => reverse({ some: { nope: 'x' } }), 'Owner.places', `'some'`);
    throwsNoConditions(() => reverse({ some: { name: undefined } }), 'Owner.places', `'some'`);
    expect(reverse({ some: { nope: 'x', name: 'y' } }).text).toBe(`id IN (${SUB} WHERE name = $name_eq_0)`);
  });

  test('an unregistered operator is dropped while a registered sibling is kept', () => {
    expect(reverse({ some: { name: { eq: 'x', bogus: 1 } } })).toEqual({
      text: `id IN (${SUB} WHERE name = $name_eq_0)`,
      vars: { name_eq_0: 'x' },
    });
  });

  test('an operator object with only undefined values raises', () => {
    throwsNoConditions(() => reverse({ some: { name: { eq: undefined } } }), 'Owner.places', `'some'`);
  });

  test('a direct value is shorthand for eq', () => {
    expect(reverse({ some: { name: 'x' } }).text).toBe(reverse({ some: { name: { eq: 'x' } } }).text);
  });
});

describe('buildReverseNestedCondition — unusable metadata', () => {
  test('a forward relation field yields no condition', () => {
    throwsNoConditions(() => reverse({ some: { name: 'x' } }, placeRegistry, ownerField), 'Owner.owner', `'some'`);
  });

  test('a field without relationInfo yields no condition', () => {
    throwsNoConditions(
      () => reverse({ some: { name: 'x' } }, placeRegistry, { ...placesField, relationInfo: undefined }),
      'Owner.places',
      `'some'`,
    );
  });

  test('a target model missing from the registry yields no condition', () => {
    throwsNoConditions(() => reverse({ some: { name: 'x' } }, { Owner: owner }), 'Owner.places', `'some'`);
  });

  test('a target with no forward relation back to the source yields no condition', () => {
    const detached: ModelMetadata = { ...place, fields: place.fields.filter((f) => f.name !== 'owner') };

    throwsNoConditions(
      () => reverse({ some: { name: 'x' } }, { ...placeRegistry, Place: detached }),
      'Owner.places',
      `'some'`,
    );
  });

  test('a back relation without a fieldRef yields no condition', () => {
    const noRef: FieldMetadata = {
      ...ownerField,
      relationInfo: { ...ownerField.relationInfo!, fieldRef: undefined },
    };
    const target: ModelMetadata = { ...place, fields: place.fields.map((f) => (f.name === 'owner' ? noRef : f)) };

    throwsNoConditions(
      () => reverse({ some: { name: 'x' } }, { ...placeRegistry, Place: target }),
      'Owner.places',
      `'some'`,
    );
  });

  test('a reverse-flagged relation in the target is not taken as the foreign key', () => {
    const flipped: FieldMetadata = {
      ...ownerField,
      relationInfo: { ...ownerField.relationInfo!, isReverse: true },
    };
    const target: ModelMetadata = { ...place, fields: place.fields.map((f) => (f.name === 'owner' ? flipped : f)) };

    throwsNoConditions(
      () => reverse({ some: { name: 'x' } }, { ...placeRegistry, Place: target }),
      'Owner.places',
      `'some'`,
    );
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

  test('undefined values are skipped; a filter left with nothing raises', () => {
    expect(forward({ name: undefined })).toEqual(EMPTY);
    throwsNoConditions(() => forward({ nope: 'x' }), 'Place.owner', `'nope'`);
    expect(forward({ nope: 'x', name: 'A' }).text).toBe('ownerId.name = $ownerId_name_eq_0');
  });

  test('an unregistered operator is dropped while a registered sibling is kept', () => {
    expect(forward({ name: { eq: 'A', bogus: 1 } }).text).toBe('ownerId.name = $ownerId_name_eq_0');
  });

  test('an operator object with only undefined values adds no condition', () => {
    throwsNoConditions(() => forward({ name: { eq: undefined } }), 'Place.owner', `'name'`);
  });

  // This case was pinned as current behavior when the file was written, and it was pinning a defect:
  // the three operators were skipped, so a filter naming only one of them produced an empty fragment
  // and the caller's whole WHERE vanished (`SELECT * FROM place`, every row, no error). Now inverted.
  test.each([
    ['AND', { AND: [{ name: 'A' }] } as WhereClause, 'ownerId.name = $ownerId_name_eq_0'],
    ['OR', { OR: [{ name: 'A' }] } as WhereClause, 'ownerId.name = $ownerId_name_eq_0'],
    ['NOT', { NOT: { name: 'A' } } as WhereClause, 'NOT (ownerId.name = $ownerId_name_eq_0)'],
  ])('%s inside a forward relation filter compiles over the dotted path', (_key, where, text) => {
    // A single surviving branch needs no parentheses, which is what the top-level handlers do too
    expect(forward(where)).toEqual({ text, vars: { ownerId_name_eq_0: 'A' } });
  });

  test('AND over several branches is parenthesised and bound in order', () => {
    expect(forward({ AND: [{ name: 'A' }, { id: 1 }] })).toEqual({
      text: '(ownerId.name = $ownerId_name_eq_0 AND ownerId.id = $ownerId_id_eq_1)',
      vars: { ownerId_name_eq_0: 'A', ownerId_id_eq_1: 1 },
    });
  });

  test('OR over several branches is parenthesised and bound in order', () => {
    expect(forward({ OR: [{ name: 'A' }, { name: 'B' }] })).toEqual({
      text: '(ownerId.name = $ownerId_name_eq_0 OR ownerId.name = $ownerId_name_eq_1)',
      vars: { ownerId_name_eq_0: 'A', ownerId_name_eq_1: 'B' },
    });
  });

  test('a branch may use operator objects, not only direct values', () => {
    expect(forward({ OR: [{ name: { contains: 'A' } }, { id: { gt: 2 } }] })).toEqual({
      text: '(string::contains(ownerId.name, $ownerId_name_contains_0) OR ownerId.id > $ownerId_id_gt_1)',
      vars: { ownerId_name_contains_0: 'A', ownerId_id_gt_1: 2 },
    });
  });

  test('an OR containing an AND nests two levels deep', () => {
    expect(forward({ OR: [{ AND: [{ name: 'A' }, { id: 1 }] }, { name: 'B' }] })).toEqual({
      text: '((ownerId.name = $ownerId_name_eq_0 AND ownerId.id = $ownerId_id_eq_1) OR ownerId.name = $ownerId_name_eq_2)',
      vars: { ownerId_name_eq_0: 'A', ownerId_id_eq_1: 1, ownerId_name_eq_2: 'B' },
    });
  });

  test('NOT wrapping an OR negates the whole disjunction', () => {
    expect(forward({ NOT: { OR: [{ name: 'A' }, { name: 'B' }] } })).toEqual({
      text: 'NOT ((ownerId.name = $ownerId_name_eq_0 OR ownerId.name = $ownerId_name_eq_1))',
      vars: { ownerId_name_eq_0: 'A', ownerId_name_eq_1: 'B' },
    });
  });

  test('a logical operator beside a plain field key composes with AND, as the top level does', () => {
    expect(forward({ name: 'Z', OR: [{ id: 1 }, { id: 2 }] })).toEqual({
      text: 'ownerId.name = $ownerId_name_eq_0 AND (ownerId.id = $ownerId_id_eq_1 OR ownerId.id = $ownerId_id_eq_2)',
      vars: { ownerId_name_eq_0: 'Z', ownerId_id_eq_1: 1, ownerId_id_eq_2: 2 },
    });
  });

  test('no caller string reaches the query text — every branch value is bound', () => {
    const result = forward({ OR: [{ name: "x' OR 1=1 --" }, { name: 'b' }] });

    expect(result.text).toBe('(ownerId.name = $ownerId_name_eq_0 OR ownerId.name = $ownerId_name_eq_1)');
    expect(result.vars).toEqual({ ownerId_name_eq_0: "x' OR 1=1 --", ownerId_name_eq_1: 'b' });
  });

  test('empty and unusable logical branches follow the top-level handlers', () => {
    // handleAnd of nothing is empty; handleOr of nothing is false, which matches no row
    throwsNoConditions(() => forward({ AND: [] }), 'Place.owner', `'AND'`);
    expect(forward({ OR: [] })).toEqual({ text: 'false', vars: {} });
    expect(forward({ NOT: {} })).toEqual({ text: 'false', vars: {} });
    // a branch naming only unknown fields contributes nothing, as it does at the top level
    expect(forward({ OR: [{ nope: 'x' }, { name: 'A' }] }).text).toBe('(ownerId.name = $ownerId_name_eq_0)');
  });

  test('a logical operator given the wrong container is not taken as a field', () => {
    // Negative: the generated Where type already forbids these shapes, so this pins the runtime
    // behaviour for an untyped caller — the key must never fall through and be read as a field name
    // @ts-expect-error AND takes an array of where clauses, not a single one
    throwsNoConditions(() => forward({ AND: { name: 'A' } }), 'Place.owner', `'AND'`);
    // @ts-expect-error OR takes an array of where clauses, not a single one
    throwsNoConditions(() => forward({ OR: { name: 'A' } }), 'Place.owner', `'OR'`);
    // @ts-expect-error NOT takes a single where clause, not an array
    throwsNoConditions(() => forward({ NOT: [{ name: 'A' }] }), 'Place.owner', `'NOT'`);
  });

  test('a reverse relation field yields no condition', () => {
    throwsNoConditions(() => forward({ name: 'A' }, placeRegistry, placesField), 'Place.places', `'name'`);
  });

  test('a field without relationInfo yields no condition', () => {
    throwsNoConditions(
      () => forward({ name: 'A' }, placeRegistry, { ...ownerField, relationInfo: undefined }),
      'Place.owner',
      `'name'`,
    );
  });

  test('a relation without a fieldRef yields no condition', () => {
    const noRef: FieldMetadata = { ...ownerField, relationInfo: { ...ownerField.relationInfo!, fieldRef: undefined } };

    throwsNoConditions(() => forward({ name: 'A' }, placeRegistry, noRef), 'Place.owner', `'name'`);
  });

  test('a target model missing from the registry yields no condition', () => {
    throwsNoConditions(() => forward({ name: 'A' }, { Place: place }), 'Place.owner', `'name'`);
  });
});

describe('buildNestedCondition — empty versus unusable filters', () => {
  // Established before the guard: `{ owner: {} }` compiled to an empty fragment and the caller
  // (condition-builder.ts) skipped it, so the clause added no condition and the query was unfiltered.
  // That is unchanged: an empty filter asked for nothing, so nothing is added and nothing throws.
  test('a genuinely empty relation filter still returns the empty fragment', () => {
    expect(buildNestedCondition(createCompileContext(), ownerField, {}, place, placeRegistry)).toEqual(EMPTY);
    expect(buildNestedCondition(createCompileContext(), placesField, {}, owner, placeRegistry)).toEqual(EMPTY);
    expect(forward({})).toEqual(EMPTY);
    expect(reverse({})).toEqual(EMPTY);
  });

  test('a filter of only undefined values counts as empty', () => {
    expect(forward({ name: undefined })).toEqual(EMPTY);
    expect(reverse({ some: undefined })).toEqual(EMPTY);
  });

  test('the error names the model, the relation and every key it could not compile', () => {
    throwsNoConditions(
      () => buildNestedCondition(createCompileContext(), ownerField, { nope: 'x', alsoNope: 1 }, place, placeRegistry),
      'Place.owner',
      `'nope', 'alsoNope'`,
    );
  });

  test('a key that compiles keeps the filter, so a lone unknown sibling does not raise', () => {
    expect(forward({ nope: 'x', name: 'A' }).text).toBe('ownerId.name = $ownerId_name_eq_0');
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
    throwsNoConditions(
      () => dispatch({ ...ownerField, relationInfo: undefined }, place, { name: 'A' }),
      'Place.owner',
      `'name'`,
    );
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
