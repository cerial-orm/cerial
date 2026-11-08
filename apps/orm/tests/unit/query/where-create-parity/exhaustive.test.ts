/**
 * Unit Tests: the oracle covers every field type and every registered operator
 *
 * A type or operator added to the registries without a slot or an operand shape here fails this file, so
 * the parity check cannot quietly stop covering what ships.
 */

import { describe, expect, test } from 'bun:test';
import { getRegisteredOperators } from '../../../../src/query/filters/registry';
import { FIELD_TYPE_REGISTRY } from '../../../../src/parser/registry/field-type-registry';
import { applies, operatorsAt, OPERATOR_SHAPES, pathsOf } from './oracle';
import { SLOTS } from './slots';

describe('field types', () => {
  const covered = new Set<string>(SLOTS.map((s) => s.type));
  // A relation stores nothing, so it holds no value to compare; objects, tuples, enums and literals are not
  // built-in names and are covered by their own slots
  const VIRTUAL = ['relation'];

  test.each([...FIELD_TYPE_REGISTRY.values()].map((e) => [e.name, e.fieldType] as const))(
    '%s has a slot',
    (_name, type) => {
      expect(covered.has(type) || VIRTUAL.includes(type)).toBe(true);
    },
  );

  test('objects, tuples, enums and literals have slots', () => {
    expect(SLOTS.some((s) => s.id.startsWith('oneLeaf.'))).toBe(true);
    expect(SLOTS.some((s) => s.id.startsWith('pairT['))).toBe(true);
    expect(covered.has('literal')).toBe(true);
    expect(SLOTS.some((s) => s.id === 'rTier')).toBe(true);
  });

  test('every shape of a field has a slot: required, optional, nullable, array, set', () => {
    for (const prefix of ['r', 'o', 'n', 'a', 's']) expect(SLOTS.some((s) => s.id === `${prefix}Int`)).toBe(true);
  });

  test('objects and tuples are walked to depth 3, with flexible and strict undeclared keys', () => {
    for (const id of [
      'deep.mid.leaf.fInt',
      'deepT[1].t[1]',
      'selfRef.child.child.fInt',
      'oneLeaf.undeclared',
      'flexLeaf.undeclared',
    ])
      expect(SLOTS.some((s) => s.id === id)).toBe(true);
  });

  test('every id type has an id slot, a foreign key slot and an array slot where it takes one', () => {
    for (const key of ['Root', 'Int', 'Uuid', 'Str', 'Union', 'UuidInt', 'Tuple', 'Object']) {
      expect(SLOTS.some((s) => s.id === `Id${key}.id`)).toBe(true);
      expect(SLOTS.some((s) => s.id === `Fk${key}.tId`)).toBe(true);
    }
    for (const key of ['Root', 'Int', 'Uuid', 'Union'])
      expect(SLOTS.some((s) => s.id === `FkArr${key}.tIds`)).toBe(true);
  });
});

describe('operators', () => {
  test('every registered operator has an operand shape, and none is invented', () => {
    expect(Object.keys(OPERATOR_SHAPES).sort()).toEqual([...getRegisteredOperators()].sort());
  });

  test('every operator is exercised by some slot, or by the shape cases for flags and text', () => {
    const exercised = new Set<string>();
    for (const slot of SLOTS) for (const op of operatorsAt(slot, 'top')) exercised.add(op);
    const byShape = Object.entries(OPERATOR_SHAPES).filter(([, shape]) => shape === 'text' || shape === 'flag');
    for (const [op] of byShape) exercised.add(op);
    for (const op of getRegisteredOperators()) expect(exercised.has(op)).toBe(true);
  });

  test('applicability follows the kind: arrays take element operators, ordered kinds take ordering', () => {
    const slot = (id: string) => SLOTS.find((s) => s.id === id)!;
    expect(applies('has', slot('aInt'))).toBe(true);
    expect(applies('has', slot('rInt'))).toBe(false);
    expect(applies('between', slot('rInt'))).toBe(true);
    expect(applies('between', slot('rStr'))).toBe(false);
    expect(applies('not', slot('rInt'))).toBe(false);
    expect(applies('not', slot('oInt'))).toBe(true);
  });

  test('every path is visited: top, NOT, AND, OR, forward and reverse relation, include where', () => {
    const paths = new Set<string>();
    for (const slot of SLOTS) for (const path of pathsOf(slot)) paths.add(path);
    expect([...paths].sort()).toEqual(['and', 'fwd', 'incFwd', 'incRev', 'not', 'or', 'rev', 'top']);
  });
});
