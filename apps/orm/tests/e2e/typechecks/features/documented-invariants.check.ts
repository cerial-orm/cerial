/**
 * Negative type tests for the invariants the schema language documents.
 *
 * Some invariants are enforced by the schema validators and have no type
 * surface at all (`@nullable` on an object field, `@onDelete` on a required
 * relation, an explicit `Record(int)` on a foreign key, `Any?`, a Record or
 * Relation inside a tuple): a schema that breaks them never reaches the
 * generator. What the types CAN prove is the consequence of each rule, and
 * that is what is asserted here.
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import type { CerialAny, CerialId } from 'cerial';
import { Test } from 'ts-toolbelt';
import type {
  AnyBasic,
  Book,
  BookUpdateInput,
  CerialClient,
  Coordinate,
  ContentItem,
  ContentItemCreate,
  ContentItemUpdate,
  Entry,
  GeometryBasicOrderBy,
  NumberBasic,
  NumberBasicCreate,
  NumberBasicUpdate,
  Publisher,
  ReviewMeta,
  TupleBasic,
  TupleBasicUpdate,
  UnsetTestModel,
} from '../../generated';

const { checks, check } = Test;

/** 1 when `T` is exactly `any`. */
type IsAny<T> = 0 extends 1 & T ? 1 : 0;

// =============================================================================
// Optional object and tuple fields are `field?: T`, never `| null`
// (`@nullable` is not allowed on them, so null has no representation)
// =============================================================================

checks([
  check<ContentItem['meta'], ReviewMeta | undefined, Test.Pass>(),
  check<TupleBasic['backup'], Coordinate | undefined, Test.Pass>(),
  check<TupleBasic['entry'], Entry | undefined, Test.Pass>(),
]);

// @ts-expect-error - an optional object has no null form; omit it to leave it unset
export const nullObjectOnCreate: ContentItemCreate = { title: 't', body: 'b', meta: null };

// @ts-expect-error - clearing an optional object is done with CerialNone, not null
export const nullObjectOnUpdate: ContentItemUpdate = { meta: null };

// @ts-expect-error - clearing an optional tuple is done with CerialNone, not null
export const nullTupleOnUpdate: TupleBasicUpdate = { backup: null };

// =============================================================================
// null needs @nullable
// =============================================================================

// `weight` is @nullable; `price` and `rating` are not
checks([
  check<NumberBasic['weight'], number | null, Test.Pass>(),
  check<NumberBasic['price'], number, Test.Pass>(),
  check<NumberBasic['rating'], number | undefined, Test.Pass>(),
]);

export const nullableAcceptsNull: NumberBasicCreate = { name: 'n', price: 1, weight: null, scores: [] };

// @ts-expect-error - price is not @nullable
export const nullOnRequired: NumberBasicCreate = { name: 'n', price: null, weight: null, scores: [] };

// @ts-expect-error - an optional field is not nullable unless it says so
export const nullOnOptional: NumberBasicCreate = { name: 'n', price: 1, weight: null, rating: null, scores: [] };

// @ts-expect-error - price is not @nullable on update either
export const nullOnUpdate: NumberBasicUpdate = { price: null };

// =============================================================================
// Number, Float and Int all read as `number`
// =============================================================================

checks([check<NumberBasic['price'], number, Test.Pass>(), check<NumberBasic['scores'], number[], Test.Pass>()]);

// @ts-expect-error - a number field does not take a numeric string
export const stringForNumber: NumberBasicCreate = { name: 'n', price: '1', weight: null, scores: [] };

// =============================================================================
// Any is the CerialAny union, never a bare `any`
// =============================================================================

checks([
  check<AnyBasic['data'], CerialAny, Test.Pass>(),
  check<AnyBasic['items'], CerialAny[], Test.Pass>(),
  check<IsAny<AnyBasic['data']>, 0, Test.Pass>(),
  check<IsAny<AnyBasic['items'][number]>, 0, Test.Pass>(),
]);

// @ts-expect-error - a function is not a value the database can hold
export const functionAsAny: AnyBasic['data'] = () => 1;

// =============================================================================
// Relations are virtual: they are never part of the stored model
// =============================================================================

// @ts-expect-error - the forward side stores publisherId, not publisher
export type StoredPublisher = Book['publisher'];

// @ts-expect-error - the reverse side stores nothing
export type StoredBooks = Publisher['books'];

checks([check<keyof Book, 'id' | 'title' | 'isbn' | 'publisherId', Test.Pass>()]);

// =============================================================================
// A model's id cannot be updated, whatever the update shape
// =============================================================================

// @ts-expect-error - the id is fixed once the record exists
export const updateId: BookUpdateInput = { id: 'book:2' };

// =============================================================================
// Abstract models produce no types and no accessor
// =============================================================================

declare const client: CerialClient;

// @ts-expect-error - an abstract model has no client accessor
export const abstractAccessor = (): unknown => client.db.ExtRelBase;

export const concreteAccessor = (): unknown => client.db.Book;

// =============================================================================
// Geometry is not orderable
// =============================================================================

checks([check<keyof GeometryBasicOrderBy, 'id' | 'name', Test.Pass>()]);

// @ts-expect-error - geometry fields are excluded from OrderBy
export const orderByGeometry: GeometryBasicOrderBy = { location: 'asc' };

// =============================================================================
// Array tuple fields are replaced or appended to, never updated per element
// =============================================================================

// @ts-expect-error - per-element update is not available on an array tuple field
export const perElementOnArray: TupleBasicUpdate = { history: { lat: 1 } };

// @ts-expect-error - an array tuple field takes push or set, not an index
export const indexOnArray: TupleBasicUpdate = { history: { 0: 1 } };

// =============================================================================
// unset exists only where the data can conflict with it
// =============================================================================

declare const unsetModel: UnsetTestModel;

export const unsetDisjointFromData = (): unknown =>
  unsetModel.updateMany({ where: {}, data: { name: 'n' }, unset: { bio: true } });

export const unsetConflictsWithData = (): unknown =>
  unsetModel.updateMany({
    where: {},
    data: { bio: 'text' },
    // @ts-expect-error - a field cannot be both set and unset in the same call
    unset: { bio: true },
  });

export const unsetRequiredField = (): unknown =>
  unsetModel.updateMany({
    where: {},
    data: { name: 'n' },
    // @ts-expect-error - a required field cannot be unset
    unset: { name: true },
  });

// =============================================================================
// Transactions cannot be nested
// =============================================================================

export const nestedInCallback = (): unknown =>
  client.$transaction(async (tx) => {
    // @ts-expect-error - the transaction client does not expose $transaction
    return tx.$transaction(async () => 1);
  });

export const nestedInManual = async (): Promise<unknown> => {
  const tx = await client.$transaction();

  // @ts-expect-error - a manual transaction does not expose $transaction either
  return tx.$transaction(async () => 1);
};

// =============================================================================
// Ids are typed per model: one model's id is not another's
// =============================================================================

checks([check<Book['id'], CerialId<string>, Test.Pass>()]);
