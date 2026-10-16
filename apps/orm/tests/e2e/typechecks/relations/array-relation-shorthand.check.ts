/**
 * Checks that a reverse array relation accepts a plain target filter (shorthand for `some`) and
 * `isEmpty`, and that a bare AND, OR or NOT directly under it stays a type error.
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import type { AuthorWhere } from '../../generated';

export const shorthand: AuthorWhere = { posts: { title: 'a' } };
export const shorthandOperator: AuthorWhere = { posts: { title: { contains: 'a' } } };
export const explicit: AuthorWhere = { posts: { some: { title: 'a' } } };
export const empty: AuthorWhere = { posts: { isEmpty: true } };
export const notEmpty: AuthorWhere = { posts: { isEmpty: false } };

// @ts-expect-error a bare logical operator is refused under an array relation
export const bareOr: AuthorWhere = { posts: { OR: [{ title: 'a' }] } };

// @ts-expect-error isEmpty is a boolean
export const badEmpty: AuthorWhere = { posts: { isEmpty: 'yes' } };

// @ts-expect-error a typo in a target field
export const typo: AuthorWhere = { posts: { titel: 'a' } };
