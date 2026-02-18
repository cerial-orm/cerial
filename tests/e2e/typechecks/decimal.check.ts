import type { CerialDecimal, CerialDecimalInput } from 'cerial';
import { Test } from 'ts-toolbelt';
import type {
  DecimalBasic,
  DecimalBasicCreate,
  DecimalBasicInput,
  DecimalBasicOrderBy,
  DecimalBasicSelect,
  DecimalBasicUpdate,
  DecimalBasicWhere,
  DecimalDecorated,
  DecimalDecoratedCreate,
  DecimalInfoInput as DecimalInfoCreateInput,
  DecimalPair,
  DecimalPairInput,
} from '../generated';

type HasKey<T, K extends string> = K extends keyof T ? 1 : 0;
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// DecimalBasic Output Type
// =============================================================================

Test.checks([
  Test.check<DecimalBasic['price'], CerialDecimal, Test.Pass>(),
  Test.check<DecimalBasic['amounts'], CerialDecimal[], Test.Pass>(),
]);

// Optional Decimal → CerialDecimal | undefined
const _optDiscount: DecimalBasic['discount'] = undefined;

// Nullable Decimal (required) → CerialDecimal | null
const _nullTax: DecimalBasic['tax'] = null;

// =============================================================================
// DecimalBasic Input Type
// =============================================================================

Test.checks([
  Test.check<DecimalBasicInput['price'], CerialDecimalInput, Test.Pass>(),
  Test.check<DecimalBasicInput['amounts'], CerialDecimalInput[], Test.Pass>(),
]);

// =============================================================================
// DecimalBasicCreate — amounts optional (defaults to []), optional/nullable fields optional
// =============================================================================

Test.checks([
  Test.check<HasKey<DecimalBasicCreate, 'price'>, 1, Test.Pass>(),
  Test.check<HasKey<DecimalBasicCreate, 'amounts'>, 1, Test.Pass>(),
  Test.check<HasKey<DecimalBasicCreate, 'discount'>, 1, Test.Pass>(),
  Test.check<HasKey<DecimalBasicCreate, 'tax'>, 1, Test.Pass>(),
]);

// Can create without optional fields (tax is required nullable)
const _minCreate: DecimalBasicCreate = { name: 'test', price: '10.50', tax: null };

// =============================================================================
// DecimalBasicUpdate — all fields optional via Partial
// =============================================================================

Test.checks([
  Test.check<HasKey<DecimalBasicUpdate, 'price'>, 1, Test.Pass>(),
  Test.check<HasKey<DecimalBasicUpdate, 'name'>, 1, Test.Pass>(),
  Test.check<HasKey<DecimalBasicUpdate, 'amounts'>, 1, Test.Pass>(),
]);

// =============================================================================
// DecimalBasicWhere — Decimal fields have comparison operators
// =============================================================================

Test.checks([
  Test.check<HasKey<DecimalBasicWhere, 'price'>, 1, Test.Pass>(),
  Test.check<HasKey<DecimalBasicWhere, 'discount'>, 1, Test.Pass>(),
  Test.check<HasKey<DecimalBasicWhere, 'tax'>, 1, Test.Pass>(),
  Test.check<HasKey<DecimalBasicWhere, 'amounts'>, 1, Test.Pass>(),
  Test.check<HasKey<DecimalBasicWhere, 'AND'>, 1, Test.Pass>(),
  Test.check<HasKey<DecimalBasicWhere, 'OR'>, 1, Test.Pass>(),
  Test.check<HasKey<DecimalBasicWhere, 'NOT'>, 1, Test.Pass>(),
]);

// =============================================================================
// DecimalBasicOrderBy
// =============================================================================

Test.checks([
  Test.check<Extends<{ price: 'asc' | 'desc' }, DecimalBasicOrderBy>, 1, Test.Pass>(),
  Test.check<Extends<{ name: 'asc' | 'desc' }, DecimalBasicOrderBy>, 1, Test.Pass>(),
]);

// =============================================================================
// DecimalBasicSelect
// =============================================================================

Test.checks([Test.check<Extends<{ price: true }, DecimalBasicSelect>, 1, Test.Pass>()]);

// =============================================================================
// DecimalDecorated — @default/@defaultAlways fields optional in Create
// =============================================================================

Test.checks([
  Test.check<HasKey<DecimalDecoratedCreate, 'defaultPrice'>, 1, Test.Pass>(),
  Test.check<HasKey<DecimalDecoratedCreate, 'alwaysPrice'>, 1, Test.Pass>(),
  Test.check<HasKey<DecimalDecoratedCreate, 'name'>, 1, Test.Pass>(),
]);

// Can create without @default/@defaultAlways fields
const _minDecCreate: DecimalDecoratedCreate = { name: 'test' };

// =============================================================================
// DecimalDecorated Output — decorator fields present (optional due to DEFAULT ALWAYS)
// =============================================================================

Test.checks([
  Test.check<HasKey<DecimalDecorated, 'defaultPrice'>, 1, Test.Pass>(),
  Test.check<HasKey<DecimalDecorated, 'alwaysPrice'>, 1, Test.Pass>(),
]);

// =============================================================================
// DecimalInfo Object — amount required, fee optional
// =============================================================================

Test.checks([
  Test.check<HasKey<DecimalInfoCreateInput, 'amount'>, 1, Test.Pass>(),
  Test.check<HasKey<DecimalInfoCreateInput, 'fee'>, 1, Test.Pass>(),
]);

// amount is required, fee is optional
const _minObjCreate: DecimalInfoCreateInput = { amount: '10.50' };

// =============================================================================
// DecimalPair Tuple — output is [CerialDecimal, CerialDecimal | null]
// =============================================================================

Test.checks([Test.check<DecimalPair, [CerialDecimal, CerialDecimal | null], Test.Pass>()]);

// Input accepts array form or object form
const _tupleArr: DecimalPairInput = ['10.50', '20.75'];
const _tupleObj: DecimalPairInput = { 0: '10.50' };
