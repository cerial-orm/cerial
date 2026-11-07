/**
 * Unit Tests: create refuses an undeclared sub-key of a strict object before any query
 *
 * The database would refuse it and echo the key raw. Update already refuses it by name; create does too.
 */

import { describe, expect, test } from 'bun:test';
import { validateCreateData } from '../../../src/query/validators/data-validator';
import { place } from './where-validation-helpers';

const base = { name: 'Hub', ownerId: 'owner:1' };
const addr = { city: 'NYC', geo: { lat: 1, lng: 2 }, loose: { lat: 1, lng: 2 } };
const fields = (data: Record<string, unknown>): string[] =>
  validateCreateData(
    { ...base, address: addr, open: addr, spot: ['a', { lat: 1, lng: 2 }], ...data },
    place,
  ).errors.map((e) => e.field);

describe('validateCreateData — undeclared object sub-keys', () => {
  test('accepts a declared shape', () => {
    expect(fields({})).toEqual([]);
  });

  test('refuses an undeclared key at the top of a strict object and deeper', () => {
    expect(fields({ address: { ...addr, extra: 1 } })).toEqual(['address.extra']);
    expect(fields({ address: { ...addr, geo: { lat: 1, lng: 2, z: 3 } } })).toEqual(['address.geo.z']);
  });

  test('refuses it in every element of an object array', () => {
    expect(fields({ stops: [addr, { ...addr, extra: 1 }] })).toEqual(['stops[1].extra']);
  });

  test('refuses it in an object inside a tuple', () => {
    expect(fields({ spot: ['a', { lat: 1, lng: 2, z: 3 }] })).toEqual(['spot[1].z']);
  });

  test('names a hostile key with its control characters escaped', () => {
    const [error] = validateCreateData({ ...base, address: { ...addr, 'a\u001b[2Jb': 1 } }, place).errors;

    expect(error!.message).not.toContain('\u001b');
    expect(error!.message).toContain('a\\u{1b}[2Jb');
  });

  test('a flexible field keeps accepting undeclared keys; a declared key beside them is still checked', () => {
    expect(fields({ open: { city: 'NYC', geo: { lat: 1, lng: 2 }, loose: { lat: 1, lng: 2 }, extra: 1 } })).toEqual([]);
    expect(fields({ openStops: [{ ...addr, extra: 1 }] })).toEqual([]);
  });
});
