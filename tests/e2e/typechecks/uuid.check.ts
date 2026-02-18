import type { CerialUuid, CerialUuidInput } from 'cerial';
import { Test } from 'ts-toolbelt';
import type {
  UuidBasic,
  UuidBasicCreate,
  UuidBasicInput,
  UuidBasicOrderBy,
  UuidBasicSelect,
  UuidBasicUpdate,
  UuidBasicWhere,
  UuidDecorated,
  UuidDecoratedCreate,
  UuidInfoCreateInput,
  UuidPair,
  UuidPairInput,
} from '../generated';

type HasKey<T, K extends string> = K extends keyof T ? 1 : 0;
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// UuidBasic Output Type
// =============================================================================

Test.checks([
  Test.check<UuidBasic['token'], CerialUuid, Test.Pass>(),
  Test.check<UuidBasic['tags'], CerialUuid[], Test.Pass>(),
]);

// Optional UUID → CerialUuid | undefined
const _optToken: UuidBasic['optionalToken'] = undefined;

// Nullable UUID → CerialUuid | null | undefined
const _nullToken: UuidBasic['nullableToken'] = null;
const _nullToken2: UuidBasic['nullableToken'] = undefined;

// =============================================================================
// UuidBasic Input Type
// =============================================================================

Test.checks([
  Test.check<UuidBasicInput['token'], CerialUuidInput, Test.Pass>(),
  Test.check<UuidBasicInput['tags'], CerialUuidInput[], Test.Pass>(),
]);

// =============================================================================
// UuidBasicCreate — tags optional (defaults to []), optional/nullable fields optional
// =============================================================================

Test.checks([
  Test.check<HasKey<UuidBasicCreate, 'token'>, 1, Test.Pass>(),
  Test.check<HasKey<UuidBasicCreate, 'tags'>, 1, Test.Pass>(),
  Test.check<HasKey<UuidBasicCreate, 'optionalToken'>, 1, Test.Pass>(),
  Test.check<HasKey<UuidBasicCreate, 'nullableToken'>, 1, Test.Pass>(),
]);

// Can create without optional fields
const _minCreate: UuidBasicCreate = { name: 'test', token: '550e8400-e29b-41d4-a716-446655440000' };

// =============================================================================
// UuidBasicUpdate — all fields optional via Partial
// =============================================================================

Test.checks([
  Test.check<HasKey<UuidBasicUpdate, 'token'>, 1, Test.Pass>(),
  Test.check<HasKey<UuidBasicUpdate, 'name'>, 1, Test.Pass>(),
  Test.check<HasKey<UuidBasicUpdate, 'tags'>, 1, Test.Pass>(),
]);

// =============================================================================
// UuidBasicWhere — UUID fields have comparison operators
// =============================================================================

Test.checks([
  Test.check<HasKey<UuidBasicWhere, 'token'>, 1, Test.Pass>(),
  Test.check<HasKey<UuidBasicWhere, 'optionalToken'>, 1, Test.Pass>(),
  Test.check<HasKey<UuidBasicWhere, 'nullableToken'>, 1, Test.Pass>(),
  Test.check<HasKey<UuidBasicWhere, 'tags'>, 1, Test.Pass>(),
  Test.check<HasKey<UuidBasicWhere, 'AND'>, 1, Test.Pass>(),
  Test.check<HasKey<UuidBasicWhere, 'OR'>, 1, Test.Pass>(),
  Test.check<HasKey<UuidBasicWhere, 'NOT'>, 1, Test.Pass>(),
]);

// =============================================================================
// UuidBasicOrderBy
// =============================================================================

Test.checks([
  Test.check<Extends<{ token: 'asc' | 'desc' }, UuidBasicOrderBy>, 1, Test.Pass>(),
  Test.check<Extends<{ name: 'asc' | 'desc' }, UuidBasicOrderBy>, 1, Test.Pass>(),
]);

// =============================================================================
// UuidBasicSelect
// =============================================================================

Test.checks([Test.check<Extends<{ token: true }, UuidBasicSelect>, 1, Test.Pass>()]);

// =============================================================================
// UuidDecorated — @uuid/@uuid4/@uuid7 fields optional in Create
// =============================================================================

Test.checks([
  Test.check<HasKey<UuidDecoratedCreate, 'autoId'>, 1, Test.Pass>(),
  Test.check<HasKey<UuidDecoratedCreate, 'autoV4'>, 1, Test.Pass>(),
  Test.check<HasKey<UuidDecoratedCreate, 'autoV7'>, 1, Test.Pass>(),
  Test.check<HasKey<UuidDecoratedCreate, 'name'>, 1, Test.Pass>(),
]);

// Can create without any @uuid fields
const _minDecCreate: UuidDecoratedCreate = { name: 'test' };

// =============================================================================
// UuidDecorated Output — decorator fields present
// =============================================================================

Test.checks([
  Test.check<HasKey<UuidDecorated, 'autoId'>, 1, Test.Pass>(),
  Test.check<HasKey<UuidDecorated, 'autoV4'>, 1, Test.Pass>(),
  Test.check<HasKey<UuidDecorated, 'autoV7'>, 1, Test.Pass>(),
]);

// =============================================================================
// UuidInfo Object — trackingId required, autoGenId optional (@uuid)
// =============================================================================

Test.checks([
  Test.check<HasKey<UuidInfoCreateInput, 'trackingId'>, 1, Test.Pass>(),
  Test.check<HasKey<UuidInfoCreateInput, 'autoGenId'>, 1, Test.Pass>(),
  Test.check<HasKey<UuidInfoCreateInput, 'label'>, 1, Test.Pass>(),
]);

// trackingId is required, autoGenId is optional (@uuid)
const _minObjCreate: UuidInfoCreateInput = { label: 'test', trackingId: '550e8400-e29b-41d4-a716-446655440000' };

// =============================================================================
// UuidPair Tuple — output is CerialUuid[]
// =============================================================================

Test.checks([Test.check<UuidPair, [CerialUuid, CerialUuid], Test.Pass>()]);

// Input accepts array form or object form
const _tupleArr: UuidPairInput = ['550e8400-e29b-41d4-a716-446655440000', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'];
const _tupleObj: UuidPairInput = { 0: '550e8400-e29b-41d4-a716-446655440000' };
