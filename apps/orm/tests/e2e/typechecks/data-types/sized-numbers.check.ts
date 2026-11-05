import { Test } from 'ts-toolbelt';
import type {
  SzFloat16,
  SzFloat16Create,
  SzFloat32,
  SzFloat32Create,
  SzFloat32Where,
  SzInt16,
  SzInt16Create,
  SzInt32,
  SzInt32Create,
  SzInt8,
  SzInt8Create,
  SzUint16,
  SzUint16Create,
  SzUint32,
  SzUint32Create,
  SzUint64,
  SzUint64Create,
  SzUint64Input,
  SzUint64ObjInput,
  SzUint64OrderBy,
  SzUint64Tup,
  SzUint64TupInput,
  SzUint64Where,
  SzUint8,
  SzUint8Create,
  SzUint8Input,
  SzUint8Update,
  SzUint8Where,
} from '../../generated';

type HasKey<T, K extends string> = K extends keyof T ? 1 : 0;
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// Output: number everywhere except Uint64, which is bigint
// =============================================================================

Test.checks([
  Test.check<SzInt8['reqVal'], number, Test.Pass>(),
  Test.check<SzUint8['reqVal'], number, Test.Pass>(),
  Test.check<SzInt16['reqVal'], number, Test.Pass>(),
  Test.check<SzUint16['reqVal'], number, Test.Pass>(),
  Test.check<SzInt32['reqVal'], number, Test.Pass>(),
  Test.check<SzUint32['reqVal'], number, Test.Pass>(),
  Test.check<SzFloat16['reqVal'], number, Test.Pass>(),
  Test.check<SzFloat32['reqVal'], number, Test.Pass>(),
  Test.check<SzUint64['reqVal'], bigint, Test.Pass>(),
]);

Test.checks([
  Test.check<SzUint8['arrVal'], number[], Test.Pass>(),
  Test.check<SzUint8['nullVal'], number | null, Test.Pass>(),
  Test.check<SzUint8['dfltVal'], number, Test.Pass>(),
  Test.check<SzUint64['arrVal'], bigint[], Test.Pass>(),
  Test.check<SzUint64['nullVal'], bigint | null, Test.Pass>(),
  Test.check<SzUint64['dfltVal'], bigint, Test.Pass>(),
  Test.check<SzUint64['objVal']['val'], bigint, Test.Pass>(),
  Test.check<SzUint64Tup[0], bigint, Test.Pass>(),
  Test.check<SzUint64Tup[1], bigint | null, Test.Pass>(),
]);

// Optional sized field is `T | undefined`, like the other optional primitives
const _optUint8: SzUint8['optVal'] = undefined;
const _optUint64: SzUint64['optVal'] = undefined;

// =============================================================================
// Input: Uint64 takes bigint | number, the rest number
// =============================================================================

Test.checks([
  Test.check<SzUint64Input['reqVal'], bigint | number, Test.Pass>(),
  Test.check<SzUint64Input['arrVal'], (bigint | number)[], Test.Pass>(),
  Test.check<SzUint64Input['nullVal'], (bigint | number) | null, Test.Pass>(),
  Test.check<SzUint64ObjInput['val'], bigint | number, Test.Pass>(),
  Test.check<SzUint8Input['reqVal'], number, Test.Pass>(),
  Test.check<SzUint8Input['arrVal'], number[], Test.Pass>(),
  Test.check<Extends<bigint, SzUint8Input['reqVal']>, 0, Test.Pass>(),
  Test.check<Extends<string, SzUint64Input['reqVal']>, 0, Test.Pass>(),
]);

// Create: defaulted field and array/set fields are optional, required ones are not
Test.checks([
  Test.check<HasKey<SzUint8Create, 'reqVal'>, 1, Test.Pass>(),
  Test.check<HasKey<SzUint8Create, 'dfltVal'>, 1, Test.Pass>(),
  // oxlint-disable-next-line typescript/no-empty-object-type -- {} is the value under test: an empty create body
  Test.check<Extends<{}, SzUint8Create>, 0, Test.Pass>(),
]);

const _u64Tup: SzUint64TupInput = [1n, 2];
const _u64Tup2: SzUint64TupInput = [1, null];

const _createUint64: SzUint64Create = {
  reqVal: 18446744073709551615n,
  nullVal: 5,
  arrVal: [1n, 2],
  setVal: [3n],
  objVal: { val: 1n },
  tupVal: [1n, null],
};

const _createUint8: SzUint8Create = {
  reqVal: 255,
  nullVal: null,
  arrVal: [1, 2],
  setVal: [1],
  objVal: { val: 1 },
  tupVal: [1, null],
};

const _createOthers = [
  {} as SzInt8Create,
  {} as SzInt16Create,
  {} as SzUint16Create,
  {} as SzInt32Create,
  {} as SzUint32Create,
  {} as SzFloat16Create,
  {} as SzFloat32Create,
];

// =============================================================================
// Update and Where
// =============================================================================

const _updateUint8: SzUint8Update = { reqVal: 5, arrVal: [1, 2] };
const _whereUint8: SzUint8Where = {
  reqVal: { gte: 1, lt: 10 },
  arrVal: { has: 5 },
  optVal: { in: [1, 2] },
};
const _whereUint64: SzUint64Where = { reqVal: { gt: 5n }, nullVal: { in: [1, 2n] } };
const _whereFloat32: SzFloat32Where = { reqVal: 0.1 };
const _orderUint64: SzUint64OrderBy = { reqVal: 'asc' };
const _orderUint64Sub: SzUint64OrderBy = { objVal: { val: 'desc' } };

// =============================================================================
// Negative: strings and wrong kinds are compile errors
// =============================================================================

// @ts-expect-error a string is not a Uint8
const _badString: SzUint8Create['reqVal'] = '5';

// @ts-expect-error a bigint is not accepted by a Uint8
const _badBigint: SzUint8Create['reqVal'] = 5n;

// @ts-expect-error a string is not a Uint64
const _badU64: SzUint64Create['reqVal'] = '5';

// @ts-expect-error a string element is not a Uint8
const _badArray: SzUint8Create['arrVal'] = ['1'];

// @ts-expect-error a string filter value is not a Uint8
const _badWhere: SzUint8Where = { reqVal: '5' };

// @ts-expect-error Uint64 output is a bigint, never a number
const _badOut: number = {} as SzUint64['reqVal'];
