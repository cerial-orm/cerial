/**
 * Where the generated update types accept more than the runtime does.
 *
 * Each assertion below pins what the generator emits TODAY. Several of them
 * describe a gap rather than an intent: when the generator is tightened the
 * affected line stops compiling, which is the signal to turn it into a
 * negative test (`@ts-expect-error`) instead of deleting it.
 *
 * The runtime validators added alongside these types are currently the only
 * guard for the shapes shown as accepted.
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { Test } from 'ts-toolbelt';
import type {
  FlexUserCreate,
  FlexUserModel,
  FlexUserUpdate,
  FlexUserUpdateInput,
  RolePairUpdate,
  Status,
  StatusPairInput,
  StatusPairUpdate,
  TupleLiteralElementUpdate,
  UnsetTestModel,
} from '../../generated';

const { checks, check } = Test;

// =============================================================================
// Per-element tuple update: a literal or enum element is typed `unknown`
// =============================================================================

// The input form carries the literal type...
checks([
  check<StatusPairInput, [Status, number] | { 0?: Status; state?: Status; 1?: number; count?: number }, Test.Pass>(),
]);

// ...but the per-element update form widens it to `unknown`, for the index key and the name key alike.
checks([
  check<StatusPairUpdate, { 0?: unknown; state?: unknown; 1?: number; count?: number }, Test.Pass>(),
  check<RolePairUpdate, { 0?: unknown; 1?: number }, Test.Pass>(),
  check<TupleLiteralElementUpdate['status'], [unknown, number] | StatusPairUpdate | undefined, Test.Pass>(),
]);

// An element that is not a literal keeps its own type, so the widening is specific to literal elements.
export const validElement: StatusPairUpdate = { state: 'active' };
export const invalidElement: StatusPairUpdate = { state: 'not-a-status', 0: 42 };

// The input form is exact, so the same invalid value is refused there.
// @ts-expect-error - 'not-a-status' is not a Status
export const invalidInput: StatusPairInput = { state: 'not-a-status' };

// A non-literal element is checked.
// @ts-expect-error - count is a number
export const invalidCount: StatusPairUpdate = { count: 'many' };

// =============================================================================
// Update methods take the data as a generic: unknown top-level keys are refused by DataArg, nested ones are not
// =============================================================================

declare const flexUsers: FlexUserModel;

// The named update types do reject unknown keys, at the top level and nested.
// @ts-expect-error - 'bogus' is not a FlexUser field
export const namedTopLevel: FlexUserUpdate = { name: 'x', bogus: 1 };

// @ts-expect-error - 'extra' is not a field of the strict FlexAddress
export const namedNested: FlexUserUpdate = { strictAddress: { street: 's', extra: 1 } };

// @ts-expect-error - 'bogus' is not a FlexProfile field
export const namedProfile: FlexUserUpdate = { profile: { bio: 'b', bogus: 1 } };

// @ts-expect-error - 'bogus' is not a FlexUser field
export const namedInput: FlexUserUpdateInput = { name: 'x', bogus: 1 };

// A generic parameter is inferred from the literal, so excess properties are never checked against the constraint;
// `DataArg` refuses an unknown top-level key anyway, while a key inside a nested value still compiles.
// Wrong value TYPES are caught either way, because they break assignability.
export const genericTopLevel = (): unknown =>
  // @ts-expect-error - 'bogus' is not a FlexUser field, and DataArg refuses it next to a valid key
  flexUsers.updateMany({ where: {}, data: { name: 'x', bogus: 1 } });
export const genericNested = (): unknown =>
  flexUsers.updateMany({ where: {}, data: { strictAddress: { street: 's', extra: 1 } } });
export const genericProfile = (): unknown =>
  flexUsers.updateMany({ where: {}, data: { profile: { bio: 'b', bogus: 1 } } });
export const genericUnique = (): unknown =>
  // @ts-expect-error - 'bogus' is not a FlexUser field, and DataArg refuses it next to a valid key
  flexUsers.updateUnique({ where: { id: 'x' }, data: { name: 'x', bogus: 1 } });
export const genericUpsert = (): unknown =>
  flexUsers.upsert({
    where: { id: 'x' },
    create: {
      name: 'n',
      address: { street: 's', city: 'c' },
      profile: { bio: 'b', metadata: { label: 'l' } },
      strictAddress: { street: 's', city: 'c' },
    },
    // @ts-expect-error - 'bogus' is not a FlexUser field, and DataArg refuses it next to a valid key
    update: { name: 'x', bogus: 1 },
  });

export const genericWrongType = (): unknown =>
  // @ts-expect-error - name is a string; a wrong value type is still rejected through the generic
  flexUsers.updateMany({ where: {}, data: { name: 5 } });

// The same holds for unset: a conflict on a top-level field is refused, but a conflict one
// level down compiles, because the narrowed target is an empty object type that is not
// checked for excess properties.
declare const unsetModel: UnsetTestModel;

export const unsetTopLevelConflict = (): unknown =>
  unsetModel.updateMany({
    where: {},
    data: { bio: 'text' },
    // @ts-expect-error - a field cannot be both set and unset in the same call
    unset: { bio: true },
  });

export const unsetNestedConflict = (): unknown =>
  unsetModel.updateMany({ where: {}, data: { address: { zip: '12345' } }, unset: { address: { zip: true } } });

// Create is not generic over its data, so it is exact.
export const createExact = (): unknown =>
  flexUsers.create({
    data: {
      name: 'n',
      address: { street: 's', city: 'c' },
      profile: { bio: 'b', metadata: { label: 'l' } },
      strictAddress: { street: 's', city: 'c' },
      // @ts-expect-error - create data is checked for unknown keys
      bogus: 1,
    } satisfies FlexUserCreate,
  });
