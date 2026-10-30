/**
 * Type checks for the builder's exclusivity rules.
 *
 * Verified with `tsc --noEmit`, NOT executed at runtime. Run: bun run typecheck
 *
 * Chaining a decorator removes every method its registry `excludes` lists from the returned type.
 */

import type { createChain } from '../../../../src/parser/builder';

declare const field: ReturnType<typeof createChain<'modelField'>>;

// Positive: every auto-generation method is on a fresh chain.
export const fresh = [
  field.uuid(),
  field.uuid4(),
  field.uuid7(),
  field.default(1),
  field.defaultAlways(1),
  field.createdAt(),
  field.updatedAt(),
  field.now(),
];

// Negative: after one, none of the others is on the returned type.
const afterUuid = field.uuid();
// @ts-expect-error @uuid excludes @uuid4: only one auto-generation decorator per field
afterUuid.uuid4();
// @ts-expect-error @uuid excludes @uuid7
afterUuid.uuid7();
// @ts-expect-error @uuid excludes @default
afterUuid.default('x');
// @ts-expect-error @uuid excludes @createdAt
afterUuid.createdAt();

// @ts-expect-error @uuid4 excludes @uuid
field.uuid4().uuid();
// @ts-expect-error @uuid7 excludes @now
field.uuid7().now();
// @ts-expect-error @default excludes @defaultAlways
field.default(1).defaultAlways(1);
// @ts-expect-error @default excludes @uuid
field.default(1).uuid();
// @ts-expect-error @defaultAlways excludes @default
field.defaultAlways(1).default(1);
// @ts-expect-error @defaultAlways excludes @createdAt
field.defaultAlways(1).createdAt();
// @ts-expect-error @createdAt excludes @updatedAt
field.createdAt().updatedAt();
// @ts-expect-error @updatedAt excludes @uuid7
field.updatedAt().uuid7();
// @ts-expect-error @now excludes @default
field.now().default(1);
// @ts-expect-error exclusion survives later chain calls
field.uuid().unique().uuid4();

// Other exclusions come from the same registry data.
// @ts-expect-error @unique excludes @index
field.unique().index();
// @ts-expect-error @index excludes @unique
field.index().unique();
// @ts-expect-error @set excludes @distinct
field.set().distinct();
// @ts-expect-error @id excludes @nullable
field.id().nullable();

// Positive: methods that are not excluded stay available.
export const kept = [
  field.uuid().unique().decorators(),
  field.uuid().readonly().decorators(),
  field.default(1).unique().decorators(),
  field.createdAt().index().decorators(),
  field.point().line().decorators(),
];

// Repeat-chaining the same method is not removed by the types.
export const twice = field.unique().unique().decorators();

// Tuple elements never get @uuid, @uuid4 or @uuid7.
declare const element: ReturnType<typeof createChain<'tupleElement'>>;
// @ts-expect-error @uuid is not available on tuple elements
element.uuid();
// @ts-expect-error @uuid4 is not available on tuple elements
element.uuid4();
// @ts-expect-error @uuid7 is not available on tuple elements
element.uuid7();
export const elementKept = element.default(1).decorators();
