/**
 * Checks the `compute` option: the result gains one key per compute entry typed by the fragment's `T`
 * (`unknown` by default), `orderBy` takes compute keys, and a key that names a field is refused.
 *
 * `T` is the caller's unchecked claim. A wrong `T` compiles, and nothing throws when the row disagrees.
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { sql } from 'cerial';
import type { CerialQueryPromise } from '../../generated';
import type { PostModel } from '../../generated/models';

declare const posts: PostModel;

type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false;
function assertType<_T extends true>() {}

// An explicit T types the key; the model's own fields stay
export const scored = posts.findMany({ compute: { score: sql<number>`string::len(title)` } });
type ScoredRow = Awaited<typeof scored>[number];
assertType<Equal<ScoredRow['score'], number>>();
assertType<Equal<ScoredRow['title'], string>>();

// No T means unknown
export const untyped = posts.findMany({ compute: { raw: sql`1` } });
assertType<Equal<Awaited<typeof untyped>[number]['raw'], unknown>>();

// Several keys, each with its own T
export const two = posts.findOne({ compute: { a: sql<number>`1`, b: sql<string>`'x'` } });
type TwoRow = NonNullable<Awaited<typeof two>>;
assertType<Equal<TwoRow['a'], number>>();
assertType<Equal<TwoRow['b'], string>>();

// With select, the compute key joins only the selected fields
export const selected = posts.findMany({ select: { title: true }, compute: { score: sql<number>`1` } });
type SelectedRow = Awaited<typeof selected>[number];
assertType<Equal<SelectedRow['score'], number>>();
assertType<Equal<SelectedRow['title'], string>>();
// @ts-expect-error body was not selected
export const unselected: SelectedRow['body'] = undefined;

// With include, the included relation stays typed
export const included = posts.findMany({ include: { author: true }, compute: { score: sql<number>`1` } });
type IncludedRow = Awaited<typeof included>[number];
assertType<Equal<IncludedRow['score'], number>>();
export const authorName: string = (null as unknown as IncludedRow).author.name;

// findUnique takes compute too
export const unique = posts.findUnique({ where: { id: 'a' }, compute: { score: sql<number>`1` } });
assertType<Equal<NonNullable<Awaited<typeof unique>>['score'], number>>();

// Without compute the result shape is unchanged
export const plain = posts.findMany();
assertType<Equal<Awaited<typeof plain>[number]['title'], string>>();

// orderBy takes compute keys, with a field key beside them
export const sorted = posts.findMany({
  compute: { score: sql<number>`1` },
  orderBy: { score: 'desc', title: 'asc' },
});
export const sortedOne = posts.findOne({ compute: { score: sql<number>`1` }, orderBy: { score: 'asc' } });

// A wrong T compiles: the claim is unchecked and nothing throws when the row disagrees
export const wrongClaim = posts.findMany({ compute: { title2: sql<number>`'not a number'` } });

export const promiseShape: CerialQueryPromise<unknown> = scored;

// @ts-expect-error a string is not a fragment
export const stringValue = posts.findMany({ compute: { score: 'string::len(title)' } });

// @ts-expect-error orderBy on a key that is not in compute
export const unknownSort = posts.findMany({ compute: { score: sql<number>`1` }, orderBy: { other: 'asc' } });

// @ts-expect-error orderBy on a compute key needs asc or desc
export const badDirection = posts.findMany({ compute: { score: sql<number>`1` }, orderBy: { score: 'up' } });

// @ts-expect-error a compute key may not collide with a field
export const collides = posts.findMany({ compute: { title: sql<number>`1` } });

// @ts-expect-error a compute key may not collide with a relation
export const collidesRelation = posts.findMany({ compute: { author: sql<number>`1` } });

export const uniqueOrder = posts.findUnique({
  where: { id: 'a' },
  compute: { score: sql<number>`1` },
  // @ts-expect-error findUnique has no orderBy
  orderBy: { score: 'asc' },
});
