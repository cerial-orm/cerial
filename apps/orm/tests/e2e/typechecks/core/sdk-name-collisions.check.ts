/**
 * Type checks for names Cerial must not share with the surrealdb SDK
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 *
 * A consumer imports from both packages in one module. If Cerial exported
 * `ValidationError` or `Token` again, the SDK's class and string alias would
 * collide with it, so both are imported side by side here.
 */

import type * as Cerial from 'cerial';
import type { CerialToken, CerialValidationIssue } from 'cerial';
import type { Token, ValidationError } from 'surrealdb';
import { Test } from 'ts-toolbelt';

// The SDK's own names keep their SDK meaning next to Cerial's.
declare const sdkToken: Token;
declare const sdkError: ValidationError;

Test.checks([
  Test.check<typeof sdkToken, string, Test.Pass>(),
  Test.check<typeof sdkError extends Error ? true : false, true, Test.Pass>(),
  Test.check<keyof CerialValidationIssue, 'path' | 'message' | 'kind', Test.Pass>(),
  Test.check<CerialToken['value'], string, Test.Pass>(),
]);

// Proving the old names are ABSENT cannot be done here: TypeScript cannot reflect over type-only
// exports, so `keyof Cerial` never lists them and a `@ts-expect-error` on a missing member stays
// satisfied either way. tests/unit/public-api/sdk-name-collisions.test.ts asserts the absence
// against the entry's own export statements, where it can actually fail.
export type _CerialNamespaceIsUsed = Cerial.CerialToken;
