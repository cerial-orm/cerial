/**
 * Type checks that pin what `include` and the field data of an update accept and refuse, where each is inferred from the
 * argument. A typo next to a valid key escapes the constraint of a bare generic, so `IncludeArg` and `DataArg` refuse it.
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { Test } from 'ts-toolbelt';
import type { GetRelObjCompanyPayload, GetUserPayload, Post, Tag } from '../../generated';
import type { CerialClient } from '../../generated/client';
import type { Flat } from '../helpers';

declare const db: CerialClient['db'];

// =============================================================================
// include
// =============================================================================

// @ts-expect-error -- a typo next to a valid relation is refused
export const includeTypoNextToKey = db.User.findMany({ include: { posts: true, nope: true } });

// @ts-expect-error -- a typo next to several valid relations is refused
export const includeTypoNextToKeys = db.User.findMany({ include: { posts: true, tags: true, nope: true } });

// @ts-expect-error -- a typo alone is refused
export const includeTypoAlone = db.User.findMany({ include: { nope: true } });

// @ts-expect-error -- a scalar field is not a relation
export const includeScalar = db.User.findMany({ include: { posts: true, name: true } });

// @ts-expect-error -- an option the relation does not take is refused
export const includeOptionTypo = db.User.findMany({ include: { posts: { limit: 1, nope: true } } });

// A typo in a nested include, next to a valid relation, one and two levels down
export const includeNestedIncludeTypo = db.User.findMany({
  // @ts-expect-error -- a typo in a nested include is refused
  include: { posts: { include: { author: true, nope: true } } },
});

export const includeDeepIncludeTypo = db.User.findMany({
  // @ts-expect-error -- a typo in an include two levels down is refused
  include: { posts: { include: { author: { include: { posts: true, nope: true } } } } },
});

// @ts-expect-error -- a typo in a single relation's include is refused
export const includeSingleTypo = db.Post.findMany({ include: { author: true, nope: true } });

// A select inside an include
export const includeSelectTypoNextToKey = db.User.findMany({
  // @ts-expect-error -- a typo next to a valid key of a select inside include is refused
  include: { posts: { select: { title: true, nope: true } } },
});

// @ts-expect-error -- a typo alone in a select inside include is refused
export const includeSelectTypoAlone = db.User.findMany({ include: { posts: { select: { nope: true } } } });

export const includeObjectSelectTypo = db.RelObjCompany.findMany({
  // @ts-expect-error -- a typo in an object select inside include is refused
  include: { employees: { select: { name: true, homeAddress: { city: true, nope: true } } } },
});

export const includeNestedSelectTypo = db.User.findMany({
  // @ts-expect-error -- a typo in a select inside a nested include is refused
  include: { posts: { include: { author: { select: { name: true, nope: true } } } } },
});

// The same on every method that takes include
// @ts-expect-error -- findOne
export const includeFindOne = db.User.findOne({ include: { posts: true, nope: true } });
// @ts-expect-error -- findUnique
export const includeFindUnique = db.User.findUnique({ where: { id: 'x' }, include: { posts: true, nope: true } });
export const includeCreate = db.User.create({
  data: { email: 'a@x.io', name: 'a', isActive: true },
  // @ts-expect-error -- create
  include: { posts: true, nope: true },
});
export const includeUpdateMany = db.User.updateMany({
  where: {},
  data: { name: 'b' },
  // @ts-expect-error -- updateMany
  include: { posts: true, nope: true },
});
export const includeUpdateUnique = db.User.updateUnique({
  where: { id: 'x' },
  data: { name: 'b' },
  // @ts-expect-error -- updateUnique
  include: { posts: true, nope: true },
});
export const includeUpsert = db.User.upsert({
  where: { id: 'x' },
  create: { email: 'a@x.io', name: 'a', isActive: true },
  // @ts-expect-error -- upsert
  include: { posts: true, nope: true },
});

// Accepted, with the result narrowed as before
export const includeOk = db.User.findMany({ include: { posts: true, tags: true } });
export const includeFalse = db.User.findMany({ include: { posts: true, tags: false } });
export const includeOptions = db.User.findMany({
  include: {
    posts: { select: { title: true }, where: { title: 'x' }, orderBy: { title: 'asc' }, limit: 2, offset: 1 },
  },
});
export const includeNested = db.User.findMany({
  include: { posts: { include: { author: { select: { name: true }, include: { profile: true } } } } },
});

type IncludeOk = Awaited<typeof includeOk>[number];
type IncludeOptions = Awaited<typeof includeOptions>[number];
type IncludeNested = Awaited<typeof includeNested>[number];
Test.checks([
  Test.check<keyof IncludeOk, keyof GetUserPayload<undefined, { posts: true; tags: true }>, Test.Pass>(),
  Test.check<IncludeOk['posts'], Post[], Test.Pass>(),
  Test.check<IncludeOk['tags'], Tag[], Test.Pass>(),
  Test.check<Flat<IncludeOptions['posts'][number]>, { title: string }, Test.Pass>(),
  Test.check<IncludeNested['posts'][number]['author']['name'], string, Test.Pass>(),
  Test.check<'email' extends keyof IncludeNested['posts'][number]['author'] ? 1 : 0, 0, Test.Pass>(),
]);

export const includeSelectWithObject = db.RelObjCompany.findMany({
  include: { employees: { select: { name: true, homeAddress: { city: true } } } },
});
type IncludedObject = Awaited<typeof includeSelectWithObject>[number];
Test.checks([
  Test.check<Flat<IncludedObject['employees'][number]['homeAddress']>, { city: string }, Test.Pass>(),
  Test.check<
    GetRelObjCompanyPayload<undefined, { employees: true }> extends { employees: unknown } ? 1 : 0,
    1,
    Test.Pass
  >(),
]);

// =============================================================================
// Field data of an update
// =============================================================================

// @ts-expect-error -- a typo next to a valid field is refused
export const dataTypoNextToKey = db.User.updateMany({ where: {}, data: { name: 'x', nope: 1 } });

// @ts-expect-error -- a typo next to several valid fields is refused
export const dataTypoNextToKeys = db.User.updateMany({ where: {}, data: { name: 'x', isActive: true, nope: 1 } });

// @ts-expect-error -- a typo alone is refused
export const dataTypoAlone = db.User.updateMany({ where: {}, data: { nope: 1 } });

// @ts-expect-error -- a typo next to a nested relation operation is refused
export const dataTypoNextToRelation = db.User.updateMany({ where: {}, data: { posts: { connect: 'x' }, nope: 1 } });

export const dataNoRelationsModel = db.FlexUser.updateMany({
  where: {},
  // @ts-expect-error -- a model without relations is checked the same way
  data: { nope: 1, address: { city: 'x' } },
});

// @ts-expect-error -- updateUnique
export const dataUpdateUnique = db.User.updateUnique({ where: { id: 'x' }, data: { name: 'x', nope: 1 } });

// @ts-expect-error -- updateUnique on a model without relations
export const dataUpdateUniqueFlat = db.FlexUser.updateUnique({ where: { id: 'x' }, data: { nope: 1, address: {} } });

export const dataUpsertUnique = db.User.upsert({
  where: { id: 'x' },
  create: { email: 'a@x.io', name: 'a', isActive: true },
  // @ts-expect-error -- upsert by a unique where: the update part
  update: { name: 'x', nope: 1 },
});

export const dataUpsertMany = db.User.upsert({
  where: { isActive: true },
  create: { email: 'a@x.io', name: 'a', isActive: true },
  // @ts-expect-error -- upsert by a general where: the update part
  update: { name: 'x', nope: 1 },
});

export const dataUpsertCreate = db.User.upsert({
  where: { id: 'x' },
  // @ts-expect-error -- upsert: the create part is a plain annotated field
  create: { email: 'a@x.io', name: 'a', isActive: true, nope: 1 },
});

// Accepted, with the result and the unset conflict rule as before
export const dataOk = db.User.updateMany({ where: {}, data: { name: 'x' } });
export const dataPartial = db.User.updateMany({
  where: {},
  data: { name: 'x', isActive: false },
  include: { posts: true },
});
export const dataRelation = db.User.updateMany({ where: {}, data: { posts: { connect: 'x' } } });
export const dataUpsertOk = db.User.upsert({
  where: { id: 'x' },
  create: { email: 'a@x.io', name: 'a', isActive: true },
  update: { name: 'x' },
  select: { name: true },
});

type DataPartial = Awaited<typeof dataPartial>;
type DataUpsertOk = Awaited<typeof dataUpsertOk>;
Test.checks([
  Test.check<DataPartial, GetUserPayload<undefined, { posts: true }>[], Test.Pass>(),
  Test.check<Flat<NonNullable<DataUpsertOk>>, { name: string }, Test.Pass>(),
]);

export const unsetOk = db.UnsetTest.updateMany({ where: {}, data: { name: 'x' }, unset: { bio: true } });
export const unsetNestedOk = db.UnsetTest.updateMany({
  where: {},
  data: { address: { zip: '1' } },
  unset: { address: { city: true } },
});
export const unsetConflict = db.UnsetTest.updateMany({
  where: {},
  data: { bio: 'x' },
  // @ts-expect-error -- a field cannot be both set and unset in the same call
  unset: { bio: true },
});
export const unsetTypoWithData = db.UnsetTest.updateMany({
  where: {},
  // @ts-expect-error -- a typo next to a valid field is refused when unset is given too
  data: { name: 'x', nope: 1 },
  unset: { bio: true },
});

// =============================================================================
// A recursive or intersected parameter can silently turn the whole signature into `never`
// =============================================================================

type Args<M extends (...args: never[]) => unknown> = Parameters<M>;
type Methods = CerialClient['db']['User'];
Test.checks([
  Test.check<[Args<Methods['findMany']>] extends [never] ? 1 : 0, 0, Test.Pass>(),
  Test.check<[Args<Methods['findOne']>] extends [never] ? 1 : 0, 0, Test.Pass>(),
  Test.check<[Args<Methods['findUnique']>] extends [never] ? 1 : 0, 0, Test.Pass>(),
  Test.check<[Args<Methods['create']>] extends [never] ? 1 : 0, 0, Test.Pass>(),
  Test.check<[Args<Methods['updateMany']>] extends [never] ? 1 : 0, 0, Test.Pass>(),
  Test.check<[Args<Methods['updateUnique']>] extends [never] ? 1 : 0, 0, Test.Pass>(),
  Test.check<[Args<Methods['upsert']>] extends [never] ? 1 : 0, 0, Test.Pass>(),
  Test.check<'include' extends keyof NonNullable<Args<Methods['findMany']>[0]> ? 1 : 0, 1, Test.Pass>(),
  Test.check<'data' extends keyof Args<Methods['updateMany']>[0] ? 1 : 0, 1, Test.Pass>(),
  Test.check<'update' extends keyof Args<Methods['upsert']>[0] ? 1 : 0, 1, Test.Pass>(),
]);
