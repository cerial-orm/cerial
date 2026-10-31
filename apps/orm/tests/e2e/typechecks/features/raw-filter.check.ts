/**
 * Checks the `$raw` where key: a SqlFragment is accepted at the top level, under AND, OR, NOT and in an
 * include `where`, and is refused in a relation filter position and for any non-fragment value.
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { sql } from 'cerial';
import type { AuthorInclude, AuthorWhere, PostWhere } from '../../generated';

const fragment = sql`string::len(title) > ${3}`;

export const top: PostWhere = { $raw: fragment };
export const withField: PostWhere = { title: 'a', $raw: fragment };
export const inAnd: PostWhere = { AND: [{ $raw: fragment }, { title: 'a' }] };
export const inOr: PostWhere = { OR: [{ $raw: fragment }] };
export const inNot: PostWhere = { NOT: { $raw: fragment } };
export const typedFragment: PostWhere = { $raw: sql<boolean>`true` };
export const inInclude: AuthorInclude = { posts: { where: { $raw: fragment } } };

// The runtime refuses a fragment nested in a relation filter, so this one is type-level only.
export const andInsideRelation: PostWhere = { author: { AND: [{ $raw: fragment }] } };

// @ts-expect-error a plain string is not a SqlFragment
export const plainString: PostWhere = { $raw: 'true' };

// @ts-expect-error an object without the fragment shape is not a SqlFragment
export const plainObject: PostWhere = { $raw: { text: 'true' } };

// @ts-expect-error a relation filter does not take $raw (single relation)
export const inSingleRelation: PostWhere = { author: { $raw: fragment } };

// @ts-expect-error a relation filter does not take $raw (some)
export const inSome: AuthorWhere = { posts: { some: { $raw: fragment } } };

// @ts-expect-error a relation filter does not take $raw (every)
export const inEvery: AuthorWhere = { posts: { every: { $raw: fragment } } };

// @ts-expect-error a relation filter does not take $raw (none)
export const inNone: AuthorWhere = { posts: { none: { $raw: fragment } } };

// @ts-expect-error the reverse-relation shorthand does not take $raw
export const inShorthand: AuthorWhere = { posts: { $raw: fragment } };
