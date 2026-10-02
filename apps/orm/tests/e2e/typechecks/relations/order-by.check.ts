/**
 * Type checks for relation fields in {Model}OrderBy
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { Test } from 'ts-toolbelt';
import type {
  BookOrderBy,
  CategoryTreeOrderBy,
  FriendOrderBy,
  PublisherInclude,
  PublisherOrderBy,
  RelObjCompanyInclude,
  RelObjEmployeeOrderBy,
} from '../../generated';

// Forward to-one relations are typed as the target's OrderBy
Test.checks([
  Test.check<BookOrderBy['publisher'], PublisherOrderBy | undefined, Test.Pass>(),
  Test.check<CategoryTreeOrderBy['parent'], CategoryTreeOrderBy | undefined, Test.Pass>(),
]);

// Reverse relations and to-many relations are not offered
Test.checks([
  Test.check<'books' extends keyof PublisherOrderBy ? 1 : 0, 0, Test.Pass>(),
  Test.check<'children' extends keyof CategoryTreeOrderBy ? 1 : 0, 0, Test.Pass>(),
  Test.check<'friends' extends keyof FriendOrderBy ? 1 : 0, 0, Test.Pass>(),
]);

export const accepted: BookOrderBy[] = [
  { publisher: { name: 'asc' } },
  { publisher: { name: 'desc' }, title: 'asc' },
  { publisher: { id: 'asc', name: 'desc' } },
];

// A chain through a second link
export const chained: CategoryTreeOrderBy = { parent: { parent: { name: 'asc' } } };

// A relation mixed with an object sub-field
export const mixed: RelObjEmployeeOrderBy = {
  company: { headquarters: { city: 'asc' } },
  homeAddress: { city: 'desc' },
  name: 'asc',
};

// An unknown field under a relation is rejected
// @ts-expect-error — 'nmae' is not a Publisher field
export const unknownUnderRelation: BookOrderBy = { publisher: { nmae: 'asc' } };

// A relation takes target fields, not a bare direction
// @ts-expect-error — a relation is not directly orderable
export const bareDirection: BookOrderBy = { publisher: 'asc' };

// An unknown top-level field is still rejected
// @ts-expect-error — 'publisherz' is not a Book field
export const unknownTopLevel: BookOrderBy = { publisherz: { name: 'asc' } };

// The reverse side is not offered
// @ts-expect-error — reverse relations are not orderable
export const reverse: PublisherOrderBy = { books: { title: 'asc' } };

// Direction values stay constrained under a relation
// @ts-expect-error — 'up' is not a direction
export const badDirection: BookOrderBy = { publisher: { name: 'up' } };

// orderBy inside include reuses the target's OrderBy, and every shape it admits is supported at runtime
export const includeOrdered: PublisherInclude = { books: { orderBy: { title: 'desc' }, limit: 2, offset: 1 } };
export const includeOrderedByRelation: PublisherInclude = { books: { orderBy: { publisher: { name: 'asc' } } } };
export const includeOrderedByObject: RelObjCompanyInclude = {
  employees: { orderBy: { homeAddress: { city: 'asc' } } },
};

// @ts-expect-error — 'titel' is not a Book field
export const includeUnknownKey: PublisherInclude = { books: { orderBy: { titel: 'asc' } } };

// @ts-expect-error — a scalar field takes a direction, not a nested value
export const includeNestedScalar: PublisherInclude = { books: { orderBy: { title: { x: 'asc' } } } };

// @ts-expect-error — the reverse side is not orderable inside include either
export const includeReverse: RelObjCompanyInclude = { employees: { orderBy: { company: { employees: 'asc' } } } };
