/**
 * Type checks for `include` on `create` and `updateMany`, and for `orderBy` on findOne and the options findOne and findUnique omit
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { Test } from 'ts-toolbelt';
import type { GetUserPayload, Post, Tag, User } from '../../generated';
import type { CerialClient } from '../../generated/client';

type Models = CerialClient['db'];
// NonNullable: findOne's options are optional, and keyof of `T | undefined` is never
type Options<M extends (...args: never[]) => unknown> = NonNullable<Parameters<M>[0]>;
type HasKey<T, K extends string> = K extends keyof T ? 1 : 0;

// A model with relations offers `include` on both writes; one without relations does not offer it at all
Test.checks([
  Test.check<HasKey<Options<Models['User']['create']>, 'include'>, 1, Test.Pass>(),
  Test.check<HasKey<Options<Models['User']['updateMany']>, 'include'>, 1, Test.Pass>(),
  Test.check<HasKey<Options<Models['FlexUser']['create']>, 'include'>, 0, Test.Pass>(),
  Test.check<HasKey<Options<Models['FlexUser']['updateMany']>, 'include'>, 0, Test.Pass>(),
]);

// findOne takes orderBy, with and without relations, but no limit or offset; findUnique takes none of the three
Test.checks([
  Test.check<HasKey<Options<Models['User']['findOne']>, 'orderBy'>, 1, Test.Pass>(),
  Test.check<HasKey<Options<Models['FlexUser']['findOne']>, 'orderBy'>, 1, Test.Pass>(),
  Test.check<HasKey<Options<Models['User']['findOne']>, 'limit'>, 0, Test.Pass>(),
  Test.check<HasKey<Options<Models['User']['findOne']>, 'offset'>, 0, Test.Pass>(),
  Test.check<HasKey<Options<Models['User']['findUnique']>, 'orderBy'>, 0, Test.Pass>(),
  Test.check<HasKey<Options<Models['User']['findUnique']>, 'limit'>, 0, Test.Pass>(),
  Test.check<HasKey<Options<Models['User']['findUnique']>, 'offset'>, 0, Test.Pass>(),
]);

declare const client: CerialClient;

// create: the result carries the included relation
export const created = client.db.User.create({
  data: { email: 'a@x.io', name: 'a', isActive: true },
  include: { posts: true },
});
export type Created = Awaited<typeof created>;
Test.checks([Test.check<Created, GetUserPayload<undefined, { posts: true }>, Test.Pass>()]);
Test.checks([Test.check<Created['posts'], Post[], Test.Pass>()]);

// create: select and include together
export const createdSelected = client.db.User.create({
  data: { email: 'a@x.io', name: 'a', isActive: true },
  select: { name: true },
  include: { tags: true },
});
export type CreatedSelected = Awaited<typeof createdSelected>;
Test.checks([Test.check<CreatedSelected['tags'], Tag[], Test.Pass>()]);
Test.checks([Test.check<CreatedSelected['name'], string, Test.Pass>()]);

// updateMany: each row carries the included relation
export const updated = client.db.User.updateMany({
  where: { isActive: true },
  data: { name: 'b' },
  include: { tags: true },
});
export type Updated = Awaited<typeof updated>;
Test.checks([Test.check<Updated, GetUserPayload<undefined, { tags: true }>[], Test.Pass>()]);
Test.checks([Test.check<Updated[number]['tags'], Tag[], Test.Pass>()]);

// Without include the result is the plain row, as before
export const plain = client.db.User.create({ data: { email: 'a@x.io', name: 'a', isActive: true } });
Test.checks([Test.check<Awaited<typeof plain>, User, Test.Pass>()]);

export const unknownRelationOnCreate = client.db.User.create({
  data: { email: 'a@x.io', name: 'a', isActive: true },
  // @ts-expect-error — 'nope' is not a User relation
  include: { nope: true },
});

export const scalarOnUpdateMany = client.db.User.updateMany({
  where: { isActive: true },
  data: { name: 'b' },
  // @ts-expect-error — 'name' is a scalar field, not a relation
  include: { name: true },
});

export const limitOnFindOne = client.db.User.findOne({
  // @ts-expect-error — findOne always returns one row, so it has no limit
  limit: 2,
});

export const offsetOnFindOne = client.db.User.findOne({
  // @ts-expect-error — findOne has no offset
  offset: 1,
});

export const orderByOnFindUnique = client.db.User.findUnique({
  where: { id: 'x' },
  // @ts-expect-error — findUnique returns one row, so it has no orderBy
  orderBy: { name: 'asc' },
});
