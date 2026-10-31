/**
 * Type checks for the tuple-element decorator whitelist and for `.named()`.
 *
 * Verified with `tsc --noEmit`, NOT executed at runtime. Run: bun run typecheck
 *
 * An element takes `@nullable`, the default and timestamp decorators, `!!private` and `.named()`. `?` is
 * refused because SurrealDB returns null, not NONE, for an absent position, and Record and Relation
 * elements do not exist. The record form names elements by key, so it refuses `.named()`.
 */

import { e, f, object, tuple } from '../../../../src/parser/builder';

const Address = object('Address', { street: f.string() });

// Positive: what the validators accept on an element stays reachable.
export const whitelisted = [
  e.string().nullable(),
  e.int().default(1),
  e.int().defaultAlways(1),
  e.date().createdAt(),
  e.date().updatedAt(),
  e.string().private(),
  e.string().nullable().named('label'),
];

// Negative: decorators that do not apply to a position.
// @ts-expect-error `?` is refused on a tuple element: SurrealDB returns null for an absent position
e.float().optional();
// @ts-expect-error @id is a model-field decorator
e.string().id();
// @ts-expect-error @unique is a field decorator, not an element one
e.string().unique();
// @ts-expect-error @index is a field decorator, not an element one
e.string().index();
// @ts-expect-error @readonly is a field decorator, not an element one
e.string().readonly();
// @ts-expect-error @uuid is not on a tuple element: SurrealDB has no DEFAULT on tuple elements
e.uuid().uuid();
// @ts-expect-error the whitelist survives chaining
e.string().nullable().unique();
// @ts-expect-error the exclusivity rules still apply on an element
e.int().default(1).defaultAlways(1);

// Negative: no Record or Relation element.
// @ts-expect-error no Record element
e.record();
// @ts-expect-error no Relation element
e.relation('User');

// Positive: an object element is legal and takes the rest of the whitelist.
export const objectElement = [e.object(Address).private()];

// Negative: an object element is not nullable, and the self reference is only a tuple element once nullable.
// @ts-expect-error SurrealDB cannot define sub-fields on a nullable object
e.object(Address).nullable();
// @ts-expect-error a required self-reference has no finite value, so it is no element
tuple('Bare', [e.self()]);
// Positive: the nullable self-reference is the legal form.
export const selfNullable = tuple('Tree', [e.int(), e.self().nullable()]);

// Positive: .named() mixes named and unnamed elements in the array form; the record form is all keys.
export const mixed = tuple('Entry', [e.string().named('label'), e.int()]);
export const keyed = tuple('Keyed', { x: e.float(), y: e.float() });

// Negative: the record key already names the element.
// @ts-expect-error a name from .named() in the record form is refused
tuple('Both', { x: e.float().named('y') });
// Negative: pick and omit take names the array form actually gave.
// @ts-expect-error `missing` names no element
mixed.pick('missing');
// @ts-expect-error `missing` names no element
mixed.omit('missing');
