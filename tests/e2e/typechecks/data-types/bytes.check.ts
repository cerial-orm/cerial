import type { CerialBytes, CerialBytesInput } from 'cerial';
import { Test } from 'ts-toolbelt';
import type {
  BytesBasic,
  BytesBasicCreate,
  BytesBasicInput,
  BytesBasicOrderBy,
  BytesBasicSelect,
  BytesBasicUpdate,
  BytesBasicWhere,
  BytesInfoInput as BytesInfoCreateInput,
  BytesPair,
  BytesPairInput,
} from '../../generated';

type HasKey<T, K extends string> = K extends keyof T ? 1 : 0;
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// BytesBasic Output Type
// =============================================================================

Test.checks([Test.check<BytesPair, [CerialBytes, CerialBytes | null], Test.Pass>()]);

// Optional Bytes → CerialBytes | undefined
const _optMetadata: BytesBasic['metadata'] = undefined;

// Nullable Bytes (required) → CerialBytes | null
const _nullTag: BytesBasic['tag'] = null;

// =============================================================================
// BytesBasic Input Type
// =============================================================================

Test.checks([
  Test.check<BytesBasicInput['payload'], CerialBytesInput, Test.Pass>(),
  Test.check<BytesBasicInput['chunks'], CerialBytesInput[], Test.Pass>(),
]);

// =============================================================================
// BytesBasicCreate — chunks optional (defaults to []), optional/nullable fields optional
// =============================================================================

Test.checks([
  Test.check<HasKey<BytesBasicCreate, 'payload'>, 1, Test.Pass>(),
  Test.check<HasKey<BytesBasicCreate, 'chunks'>, 1, Test.Pass>(),
  Test.check<HasKey<BytesBasicCreate, 'metadata'>, 1, Test.Pass>(),
  Test.check<HasKey<BytesBasicCreate, 'tag'>, 1, Test.Pass>(),
]);

// Can create without optional fields (tag is required nullable)
const _minCreate: BytesBasicCreate = {
  name: 'test',
  payload: new Uint8Array([1, 2, 3]),
  tag: null,
};

// =============================================================================
// BytesBasicUpdate — all fields optional via Partial
// =============================================================================

Test.checks([
  Test.check<HasKey<BytesBasicUpdate, 'payload'>, 1, Test.Pass>(),
  Test.check<HasKey<BytesBasicUpdate, 'name'>, 1, Test.Pass>(),
  Test.check<HasKey<BytesBasicUpdate, 'chunks'>, 1, Test.Pass>(),
]);

// =============================================================================
// BytesBasicWhere — Bytes fields have equality operators only (no gt/lt/gte/lte/between)
// =============================================================================

Test.checks([
  Test.check<HasKey<BytesBasicWhere, 'payload'>, 1, Test.Pass>(),
  Test.check<HasKey<BytesBasicWhere, 'metadata'>, 1, Test.Pass>(),
  Test.check<HasKey<BytesBasicWhere, 'tag'>, 1, Test.Pass>(),
  Test.check<HasKey<BytesBasicWhere, 'chunks'>, 1, Test.Pass>(),
  Test.check<HasKey<BytesBasicWhere, 'AND'>, 1, Test.Pass>(),
  Test.check<HasKey<BytesBasicWhere, 'OR'>, 1, Test.Pass>(),
  Test.check<HasKey<BytesBasicWhere, 'NOT'>, 1, Test.Pass>(),
]);

// =============================================================================
// BytesBasicOrderBy
// =============================================================================

Test.checks([
  Test.check<Extends<{ payload: 'asc' | 'desc' }, BytesBasicOrderBy>, 1, Test.Pass>(),
  Test.check<Extends<{ name: 'asc' | 'desc' }, BytesBasicOrderBy>, 1, Test.Pass>(),
]);

// =============================================================================
// BytesBasicSelect
// =============================================================================

Test.checks([Test.check<Extends<{ payload: true }, BytesBasicSelect>, 1, Test.Pass>()]);

// =============================================================================
// BytesInfo Object — content required, extra optional
// =============================================================================

Test.checks([
  Test.check<HasKey<BytesInfoCreateInput, 'content'>, 1, Test.Pass>(),
  Test.check<HasKey<BytesInfoCreateInput, 'extra'>, 1, Test.Pass>(),
]);

// content is required, extra is optional
const _minObjCreate: BytesInfoCreateInput = { content: new Uint8Array([1]) };

// =============================================================================
// BytesPair Tuple — output is [CerialBytes, CerialBytes | null]
// =============================================================================

Test.checks([Test.check<BytesPair, [CerialBytes, CerialBytes | null], Test.Pass>()]);

// Input accepts array form or object form
const _tupleArr: BytesPairInput = [new Uint8Array([1]), new Uint8Array([2])];
const _tupleObj: BytesPairInput = { 0: new Uint8Array([1]) };
