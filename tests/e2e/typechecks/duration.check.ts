import { Test } from 'ts-toolbelt';
import type {
  DurationBasic,
  DurationBasicInput,
  DurationBasicCreate,
  DurationBasicUpdate,
  DurationBasicWhere,
  DurationBasicOrderBy,
  DurationBasicSelect,
  DurationDecorated,
  DurationDecoratedCreate,
  DurationDecoratedUpdate,
  DurationInfo,
  DurationInfoInput,
  DurationInfoInput as DurationInfoCreateInput,
  DurationInfoWhere,
  DurationPair,
  DurationPairInput,
} from '../generated';
import type { CerialDuration, CerialDurationInput } from 'cerial';

type HasKey<T, K extends string> = K extends keyof T ? 1 : 0;
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// DurationBasic Output Type
// =============================================================================

Test.checks([
  Test.check<DurationBasic['ttl'], CerialDuration, Test.Pass>(),
  Test.check<DurationBasic['intervals'], CerialDuration[], Test.Pass>(),
]);

// Optional Duration → CerialDuration | undefined
const _optTimeout: DurationBasic['timeout'] = undefined;

// Nullable Duration (required) → CerialDuration | null
const _nullCooldown: DurationBasic['cooldown'] = null;

// =============================================================================
// DurationBasic Input Type
// =============================================================================

Test.checks([
  Test.check<DurationBasicInput['ttl'], CerialDurationInput, Test.Pass>(),
  Test.check<DurationBasicInput['intervals'], CerialDurationInput[], Test.Pass>(),
]);

// =============================================================================
// DurationBasicCreate — intervals optional (defaults to []), optional/nullable fields optional
// =============================================================================

Test.checks([
  Test.check<HasKey<DurationBasicCreate, 'ttl'>, 1, Test.Pass>(),
  Test.check<HasKey<DurationBasicCreate, 'intervals'>, 1, Test.Pass>(),
  Test.check<HasKey<DurationBasicCreate, 'timeout'>, 1, Test.Pass>(),
  Test.check<HasKey<DurationBasicCreate, 'cooldown'>, 1, Test.Pass>(),
]);

// Can create without optional fields (cooldown is required nullable)
const _minCreate: DurationBasicCreate = { name: 'test', ttl: '1h', cooldown: null };

// =============================================================================
// DurationBasicUpdate — all fields optional via Partial
// =============================================================================

Test.checks([
  Test.check<HasKey<DurationBasicUpdate, 'ttl'>, 1, Test.Pass>(),
  Test.check<HasKey<DurationBasicUpdate, 'name'>, 1, Test.Pass>(),
  Test.check<HasKey<DurationBasicUpdate, 'intervals'>, 1, Test.Pass>(),
]);

// =============================================================================
// DurationBasicWhere — Duration fields have comparison operators
// =============================================================================

Test.checks([
  Test.check<HasKey<DurationBasicWhere, 'ttl'>, 1, Test.Pass>(),
  Test.check<HasKey<DurationBasicWhere, 'timeout'>, 1, Test.Pass>(),
  Test.check<HasKey<DurationBasicWhere, 'cooldown'>, 1, Test.Pass>(),
  Test.check<HasKey<DurationBasicWhere, 'intervals'>, 1, Test.Pass>(),
  Test.check<HasKey<DurationBasicWhere, 'AND'>, 1, Test.Pass>(),
  Test.check<HasKey<DurationBasicWhere, 'OR'>, 1, Test.Pass>(),
  Test.check<HasKey<DurationBasicWhere, 'NOT'>, 1, Test.Pass>(),
]);

// =============================================================================
// DurationBasicOrderBy
// =============================================================================

Test.checks([
  Test.check<Extends<{ ttl: 'asc' | 'desc' }, DurationBasicOrderBy>, 1, Test.Pass>(),
  Test.check<Extends<{ name: 'asc' | 'desc' }, DurationBasicOrderBy>, 1, Test.Pass>(),
]);

// =============================================================================
// DurationBasicSelect
// =============================================================================

Test.checks([Test.check<Extends<{ ttl: true }, DurationBasicSelect>, 1, Test.Pass>()]);

// =============================================================================
// DurationDecorated — @default/@defaultAlways fields optional in Create
// =============================================================================

Test.checks([
  Test.check<HasKey<DurationDecoratedCreate, 'defaultTtl'>, 1, Test.Pass>(),
  Test.check<HasKey<DurationDecoratedCreate, 'alwaysTtl'>, 1, Test.Pass>(),
  Test.check<HasKey<DurationDecoratedCreate, 'name'>, 1, Test.Pass>(),
]);

// Can create without @default/@defaultAlways fields
const _minDecCreate: DurationDecoratedCreate = { name: 'test' };

// =============================================================================
// DurationDecorated Output — decorator fields present (optional due to DEFAULT ALWAYS)
// =============================================================================

Test.checks([
  Test.check<HasKey<DurationDecorated, 'defaultTtl'>, 1, Test.Pass>(),
  Test.check<HasKey<DurationDecorated, 'alwaysTtl'>, 1, Test.Pass>(),
]);

// =============================================================================
// DurationInfo Object — expires required, grace optional
// =============================================================================

Test.checks([
  Test.check<HasKey<DurationInfoCreateInput, 'expires'>, 1, Test.Pass>(),
  Test.check<HasKey<DurationInfoCreateInput, 'grace'>, 1, Test.Pass>(),
]);

// expires is required, grace is optional
const _minObjCreate: DurationInfoCreateInput = { expires: '1h' };

// =============================================================================
// DurationPair Tuple — output is [CerialDuration, CerialDuration | null]
// =============================================================================

Test.checks([Test.check<DurationPair, [CerialDuration, CerialDuration | null], Test.Pass>()]);

// Input accepts array form or object form
const _tupleArr: DurationPairInput = ['1h', '30m'];
const _tupleObj: DurationPairInput = { 0: '1h' };
