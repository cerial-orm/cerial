import { Test } from 'ts-toolbelt';
import type {
  SetBasic,
  SetBasicInput,
  SetBasicCreate,
  SetBasicUpdate,
  SetBasicWhere,
  SetBasicSelect,
} from '../generated';
import type { CerialId, CerialSet, CerialUuid, CerialUuidInput } from 'cerial';

type HasKey<T, K extends string> = K extends keyof T ? 1 : 0;

// =============================================================================
// SetBasic Output Type — uses CerialSet<T> for @set fields
// =============================================================================

Test.checks([
  Test.check<SetBasic['id'], CerialId<string>, Test.Pass>(),
  Test.check<SetBasic['name'], string, Test.Pass>(),
  Test.check<SetBasic['tags'], CerialSet<string>, Test.Pass>(),
  Test.check<SetBasic['numbers'], CerialSet<number>, Test.Pass>(),
  Test.check<SetBasic['uuids'], CerialSet<CerialUuid>, Test.Pass>(),
]);

// =============================================================================
// SetBasic Input Type — uses regular T[] (not CerialSet)
// =============================================================================

Test.checks([
  Test.check<SetBasicInput['tags'], string[], Test.Pass>(),
  Test.check<SetBasicInput['numbers'], number[], Test.Pass>(),
  Test.check<SetBasicInput['uuids'], CerialUuidInput[], Test.Pass>(),
]);

// =============================================================================
// SetBasicCreate — array fields are optional (default to [])
// =============================================================================

Test.checks([
  Test.check<HasKey<SetBasicCreate, 'name'>, 1, Test.Pass>(),
  Test.check<HasKey<SetBasicCreate, 'tags'>, 1, Test.Pass>(),
  Test.check<HasKey<SetBasicCreate, 'numbers'>, 1, Test.Pass>(),
]);

// =============================================================================
// SetBasicWhere — has array operators
// =============================================================================

Test.checks([
  Test.check<HasKey<SetBasicWhere, 'tags'>, 1, Test.Pass>(),
  Test.check<HasKey<SetBasicWhere, 'numbers'>, 1, Test.Pass>(),
  Test.check<HasKey<SetBasicWhere, 'name'>, 1, Test.Pass>(),
  Test.check<HasKey<SetBasicWhere, 'AND'>, 1, Test.Pass>(),
  Test.check<HasKey<SetBasicWhere, 'OR'>, 1, Test.Pass>(),
]);

// =============================================================================
// SetBasicSelect — boolean fields
// =============================================================================

const _select: SetBasicSelect = { tags: true };

// =============================================================================
// SetBasicUpdate — array operations available
// =============================================================================

Test.checks([
  Test.check<HasKey<SetBasicUpdate, 'tags'>, 1, Test.Pass>(),
  Test.check<HasKey<SetBasicUpdate, 'numbers'>, 1, Test.Pass>(),
]);
