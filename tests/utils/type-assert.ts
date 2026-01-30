/**
 * Type assertion utilities using ts-toolbelt
 *
 * IMPORTANT: ts-toolbelt's Test.check/checks are compile-time only.
 * Files using them cannot be executed at runtime - use `tsc --noEmit` instead.
 *
 * @example In *.check.ts files (verified with `bun run typecheck`):
 * ```typescript
 * import { Test } from 'ts-toolbelt';
 * import type { User, GetUserPayload } from '../generated';
 *
 * // Compile-time assertion - tsc fails if types don't match
 * Test.checks([
 *   Test.check<User['id'], string, Test.Pass>(),
 *   Test.check<GetUserPayload<undefined>, User, Test.Pass>(),
 * ]);
 * ```
 *
 * @see tests/e2e/typechecks/ for type verification files
 * @see tests/e2e/typechecks/README.md for documentation
 */

// This file exists for documentation purposes.
// Import directly from 'ts-toolbelt' in your .check.ts files.
export {};
