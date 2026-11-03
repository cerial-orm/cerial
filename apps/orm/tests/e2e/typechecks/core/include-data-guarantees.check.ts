/**
 * Type checks that pin what `include` and the field data of an update accept and refuse, where each is inferred from the
 * argument. A typo next to a valid key escapes the constraint of a bare generic, so `IncludeArg` and `DataArg` refuse it.
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { NONE } from 'cerial';
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
// Nested data values: objects, tuple elements, array operations and nested writes
// =============================================================================

// A typo next to a valid key inside an object field, on every method that takes field data
export const nestedUpdateMany = db.UnsetTest.updateMany({
  where: {},
  // @ts-expect-error -- updateMany: an object field
  data: { address: { street: 's', nope: 1 } },
});
export const nestedUpdateUnique = db.UnsetTest.updateUnique({
  where: { id: 'x' },
  // @ts-expect-error -- updateUnique: an object field
  data: { address: { street: 's', nope: 1 } },
});
export const nestedUpsertUnique = db.UnsetTest.upsert({
  where: { id: 'x' },
  create: { name: 'n', address: { street: 's', city: 'c' }, pos: [1, 2], nested: deepOuter() },
  // @ts-expect-error -- upsert by a unique where, update part: an object field
  update: { address: { street: 's', nope: 1 } },
});
export const nestedUpsertMany = db.UnsetTest.upsert({
  where: { name: 'n' },
  create: { name: 'n', address: { street: 's', city: 'c' }, pos: [1, 2], nested: deepOuter() },
  // @ts-expect-error -- upsert by a general where, update part: an object field
  update: { address: { street: 's', nope: 1 } },
});
export const nestedUpsertCreate = db.UnsetTest.upsert({
  where: { id: 'x' },
  // @ts-expect-error -- upsert, create part: an object field
  create: { name: 'n', address: { street: 's', city: 'c', nope: 1 }, pos: [1, 2], nested: deepOuter() },
});
export const nestedCreate = db.UnsetTest.create({
  // @ts-expect-error -- create: an object field
  data: { name: 'n', address: { street: 's', city: 'c', nope: 1 }, pos: [1, 2], nested: deepOuter() },
});

declare function deepOuter(): { title: string; mid: { label: string; deep: { code: string } } };

// An object inside an object, and inside the set form
export const nestedDeep = db.UnsetTest.updateMany({
  where: {},
  // @ts-expect-error -- a typo two objects down
  data: { nested: { mid: { label: 'l', deep: { code: 'c', nope: 1 } } } },
});
export const nestedSetForm = db.UnsetTest.updateMany({
  where: {},
  // @ts-expect-error -- a typo inside the set form
  data: { address: { set: { street: 's', city: 'c', nope: 1 } } },
});
export const nestedOptionalObject = db.UnsetTest.updateMany({
  where: {},
  // @ts-expect-error -- a typo inside an optional object field
  data: { shipping: { street: 's', nope: 1 } },
});

// Tuple object elements, in the array form and the object form, and in the per-position update form
export const nestedTupleArray = db.UnsetTest.updateMany({
  where: {},
  // @ts-expect-error -- a typo inside an object element of a tuple in array form
  data: { tagged: ['t', { payload: 'p', nope: 1 }] },
});
export const nestedTupleObject = db.UnsetTest.updateMany({
  where: {},
  // @ts-expect-error -- a typo inside an object element of a tuple in object form
  data: { tagged: { tag: 't', 1: { set: { payload: 'p', nope: 1 } } } },
});
export const nestedTupleElementUpdate = db.UnsetTest.updateMany({
  where: {},
  // @ts-expect-error -- a typo inside the per-position update of a tuple element
  data: { tagged: { 1: { payload: 'p', nope: 1 } } },
});
export const nestedTupleKey = db.UnsetTest.updateMany({
  where: {},
  // @ts-expect-error -- a typo as a key of a tuple's object form
  data: { tagged: { tag: 't', nope: 1 } },
});
export const nestedTupleOfTuples = db.ExtTupleModel.updateMany({
  where: {},
  // prettier-ignore
  // @ts-expect-error -- a typo inside an object element of a tuple of objects
  data: { coordPair: [{ x: 1, y: 2 }, { x: 1, y: 2, nope: 1 }] },
});

// Array operations on an array of objects: the plain array, push (one and many), set and updateWhere
export const nestedArrayPlain = db.ObjectTestOrder.updateMany({
  where: {},
  // @ts-expect-error -- a typo inside an element of a plain array of objects
  data: { items: [{ productName: 'a', quantity: 1, price: 1, tags: [], nope: 1 }] },
});
export const nestedArrayPushOne = db.ObjectTestOrder.updateMany({
  where: {},
  // @ts-expect-error -- a typo inside a single pushed object
  data: { items: { push: { productName: 'a', quantity: 1, price: 1, tags: [], nope: 1 } } },
});
export const nestedArrayPushMany = db.ObjectTestOrder.updateMany({
  where: {},
  // prettier-ignore
  // @ts-expect-error -- a typo inside one of several pushed objects
  data: { items: { push: [{ productName: 'a', quantity: 1, price: 1, tags: [] }, { productName: 'b', quantity: 1, price: 1, tags: [], nope: 1 }] } },
});

export const nestedArraySet = db.ObjectTestOrder.updateUnique({
  where: { id: 'x' },
  // @ts-expect-error -- a typo inside a set element
  data: { items: { set: [{ productName: 'a', quantity: 1, price: 1, tags: [], nope: 1 }] } },
});
export const nestedArrayUpdateWhere = db.ObjectTestOrder.updateMany({
  where: {},
  // @ts-expect-error -- a typo inside the data of updateWhere
  data: { items: { updateWhere: { where: { productName: 'a' }, data: { quantity: 2, nope: 1 } } } },
});
export const nestedArrayOperation = db.ObjectTestOrder.updateMany({
  where: {},
  // @ts-expect-error -- a typo next to a valid array operation
  data: { items: { push: { productName: 'a', quantity: 1, price: 1, tags: [] }, nope: 1 } },
});
export const nestedArrayPush = db.RelObjCompany.updateMany({
  where: {},
  // @ts-expect-error -- a typo inside the push of a nested create
  data: { employees: { create: [{ name: 'a', homeAddress: addr(), nope: 1 }] } },
});
declare function addr(): { street: string; city: string; state: string };

// Nested-write blocks
export const nestedConnectKey = db.User.updateMany({
  where: {},
  // @ts-expect-error -- a typo next to a valid key of a connect block
  data: { posts: { connect: 'x', nope: 1 } },
});
export const nestedCreateBlock = db.User.updateMany({
  where: {},
  // @ts-expect-error -- a typo inside a create block's record
  data: { posts: { create: { title: 'a', nope: 1 } } },
});
export const nestedCreateList = db.User.updateMany({
  where: {},
  // @ts-expect-error -- a typo inside one record of a create list
  data: { posts: { create: [{ title: 'a' }, { title: 'b', nope: 1 }] } },
});
export const nestedCreateSetUpdateUnique = db.User.updateUnique({
  where: { id: 'x' },
  // @ts-expect-error -- a typo next to a valid key of a set block
  data: { tags: { set: ['a'], nope: 1 } },
});
export const nestedUpsertBlock = db.User.upsert({
  where: { id: 'x' },
  create: { email: 'a@x.io', name: 'a', isActive: true },
  // @ts-expect-error -- upsert, update part: a typo inside a nested create
  update: { posts: { create: { title: 'a', nope: 1 } } },
});
export const nestedProfileCreate = db.User.updateMany({
  where: {},
  // @ts-expect-error -- a typo inside the create of a to-one relation
  data: { profile: { create: { bio: 'b', nope: 1 } } },
});
export const nestedCreateRelation = db.Post.create({
  // @ts-expect-error -- create: a typo inside the nested create of a relation
  data: { title: 'a', author: { create: { email: 'a@x.io', name: 'a', isActive: true, nope: 1 } } },
});

// Five levels are checked, the sixth is not (selection and narrowing are unaffected beyond the cap)
export const nestedLevelFive = db.UnsetTest.updateMany({
  where: {},
  // @ts-expect-error -- a typo in the fifth level of keys is refused
  data: { tree: { payload: 'a', child: { payload: 'b', child: { payload: 'c', child: { payload: 'd', nope: 1 } } } } },
});
export const nestedBeyondCap = db.UnsetTest.updateMany({
  where: {},
  data: {
    tree: {
      payload: 'a',
      child: { payload: 'b', child: { payload: 'c', child: { payload: 'd', child: { payload: 'e', nope: 1 } } } },
    },
  },
});

// Accepted nested forms
export const nestedOkObject = db.UnsetTest.updateMany({ where: {}, data: { address: { street: 's' } } });
export const nestedOkSet = db.UnsetTest.updateMany({
  where: {},
  data: { address: { set: { street: 's', city: 'c', zip: 'z' } } },
});
export const nestedOkDeep = db.UnsetTest.updateMany({
  where: {},
  data: { nested: { mid: { label: 'l', deep: { code: 'c', note: 'n' } } } },
});
export const nestedOkNone = db.UnsetTest.updateMany({ where: {}, data: { shipping: NONE, bio: NONE } });
export const nestedOkTupleArray = db.UnsetTest.updateMany({
  where: {},
  data: { pos: [1, 2], tagged: ['t', { payload: 'p', extra: 'e' }] },
});
export const nestedOkTupleObject = db.UnsetTest.updateMany({
  where: {},
  data: { pos: { lat: 1 }, tagged: { tag: 't', 1: { payload: 'p' } } },
});
export const nestedOkTupleSet = db.UnsetTest.updateMany({
  where: {},
  data: { tagged: { 1: { set: { payload: 'p' } } } },
});
export const nestedOkTupleOfObjects = db.ExtTupleModel.updateMany({
  where: {},
  data: {
    coordPair: [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ],
  },
});
export const nestedOkTupleOfObjectsForm = db.ExtTupleModel.updateMany({
  where: {},
  data: { coordPair: { 0: { x: 1 }, 1: { set: { x: 1, y: 2 } } } },
});
export const nestedOkUnset = db.UnsetTest.updateUnique({
  where: { id: 'x' },
  data: { address: { street: 's' } },
  unset: { address: { zip: true }, bio: true },
});
export const nestedOkUpsert = db.UnsetTest.upsert({
  where: { id: 'x' },
  create: { name: 'n', address: { street: 's', city: 'c' }, pos: [1, 2], nested: deepOuter() },
  update: { address: { street: 's' }, tagged: ['t', { payload: 'p' }] },
});
export const nestedOkTree = db.UnsetTest.updateMany({
  where: {},
  data: { tree: { payload: 'a', child: { payload: 'b', child: { payload: 'c' } } } },
});
export const nestedOkFlexible = db.FlexUser.updateMany({
  where: {},
  data: {
    address: { street: 's', anything: 1, more: { deep: true } },
    shipping: { zip: 'z', extra: 'e' },
    tags: { push: [{ street: 's', city: 'c', whatever: 1 }] },
    profile: { bio: 'b' },
  },
});
export const nestedOkFlexibleSet = db.FlexUser.updateMany({
  where: {},
  data: { address: { set: { street: 's', city: 'c', undeclared: 1 } }, tags: [{ street: 's', city: 'c', x: 1 }] },
});
export const nestedOkConnect = db.User.updateMany({
  where: {},
  data: { posts: { connect: ['a', 'b'], disconnect: 'c' }, tags: { set: ['a'] } },
});
export const nestedOkCreate = db.User.updateMany({
  where: {},
  data: { posts: { create: [{ title: 'a' }, { title: 'b' }] }, profile: { create: { bio: 'b' } } },
});
export const nestedOkArrayOps = db.User.updateUnique({
  where: { id: 'x' },
  data: { nicknames: { push: ['a', 'b'] }, scores: { push: 1 } },
});
export const nestedOkArrayPlain = db.ObjectTestOrder.updateMany({
  where: {},
  data: { items: [{ productName: 'a', quantity: 1, price: 1, tags: [] }] },
});
export const nestedOkArrayPush = db.ObjectTestOrder.updateMany({
  where: {},
  data: { items: { push: { productName: 'a', quantity: 1, price: 1, tags: [] } } },
});
export const nestedOkArrayPushMany = db.ObjectTestOrder.updateMany({
  where: {},
  data: {
    items: {
      push: [{ productName: 'a', quantity: 1, price: 1, tags: [] }],
      set: [{ productName: 'b', quantity: 1, price: 1, tags: [] }],
    },
  },
});
export const nestedOkArrayUpdateWhere = db.ObjectTestOrder.updateMany({
  where: {},
  data: {
    items: {
      updateWhere: { where: { productName: 'a' }, data: { quantity: 2 } },
      unset: { where: { productName: 'b' } },
    },
  },
});
export const nestedOkDate = db.User.updateMany({ where: {}, data: { name: 'x', isActive: true } });
export const nestedOkCreateRelation = db.Post.create({
  data: { title: 'a', author: { connect: 'x' } },
});

// =============================================================================
// A recursive or intersected parameter can silently turn the whole signature into `never`
// =============================================================================

type Args<M extends (...args: never[]) => unknown> = Parameters<M>;
type Methods = CerialClient['db']['User'];
type UnsetMethods = CerialClient['db']['UnsetTest'];
Test.checks([
  Test.check<[Args<Methods['findMany']>] extends [never] ? 1 : 0, 0, Test.Pass>(),
  Test.check<[Args<Methods['findOne']>] extends [never] ? 1 : 0, 0, Test.Pass>(),
  Test.check<[Args<Methods['findUnique']>] extends [never] ? 1 : 0, 0, Test.Pass>(),
  Test.check<[Args<Methods['create']>] extends [never] ? 1 : 0, 0, Test.Pass>(),
  Test.check<[Args<Methods['updateMany']>] extends [never] ? 1 : 0, 0, Test.Pass>(),
  Test.check<[Args<Methods['updateUnique']>] extends [never] ? 1 : 0, 0, Test.Pass>(),
  Test.check<[Args<Methods['upsert']>] extends [never] ? 1 : 0, 0, Test.Pass>(),
  Test.check<[Args<UnsetMethods['updateMany']>] extends [never] ? 1 : 0, 0, Test.Pass>(),
  Test.check<[Args<UnsetMethods['updateUnique']>] extends [never] ? 1 : 0, 0, Test.Pass>(),
  Test.check<[Args<UnsetMethods['upsert']>] extends [never] ? 1 : 0, 0, Test.Pass>(),
  Test.check<[Args<UnsetMethods['create']>] extends [never] ? 1 : 0, 0, Test.Pass>(),
  Test.check<'include' extends keyof NonNullable<Args<Methods['findMany']>[0]> ? 1 : 0, 1, Test.Pass>(),
  Test.check<'data' extends keyof Args<Methods['updateMany']>[0] ? 1 : 0, 1, Test.Pass>(),
  Test.check<'update' extends keyof Args<Methods['upsert']>[0] ? 1 : 0, 1, Test.Pass>(),
]);
