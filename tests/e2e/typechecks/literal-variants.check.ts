/**
 * Type checks for literal types with tuple and object variants
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { Test } from 'ts-toolbelt';
import type {
  // Literal types
  WithTuple,
  WithTupleInput,
  WithTupleWhere,
  WithObject,
  WithObjectInput,
  WithObjectWhere,
  WithBoth,
  WithBothInput,
  WithBothWhere,
  WithObjectOpt,
  WithObjectOptInput,
  WithObjectOptWhere,
  // Referenced types
  LiteralCoord,
  LiteralCoordInput,
  LiteralPoint,
  LiteralPointInput,
  LiteralPointOpt,
  LiteralPointOptInput,
  // Model types
  LiteralWithTuple,
  LiteralWithTupleInput,
  LiteralWithTupleCreate,
  LiteralWithTupleUpdate,
  LiteralWithTupleWhere as ModelTupleWhere,
  LiteralWithObjectVariant,
  LiteralWithObjectVariantInput,
  LiteralWithObjectVariantCreate,
  LiteralWithObjectVariantUpdate,
  LiteralWithObjectVariantWhere as ModelObjWhere,
  LiteralWithBoth,
  LiteralWithBothInput,
  LiteralWithBothCreate,
  LiteralWithBothUpdate,
  LiteralWithBothWhere as ModelBothWhere,
  LiteralWithObjectOpt,
  LiteralWithObjectOptInput,
  LiteralWithObjectOptCreate,
  LiteralWithObjectOptUpdate,
  LiteralWithObjectOptWhere as ModelObjOptWhere,
} from '../generated';
import type { CerialId, CerialNone } from 'cerial';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// Literal Output Types
// =============================================================================

Test.checks([
  // WithTuple = 'none' | LiteralCoord (i.e. 'none' | [number, number])
  Test.check<WithTuple, 'none' | LiteralCoord, Test.Pass>(),

  // WithObject = 'empty' | LiteralPoint (i.e. 'empty' | { label: string; value: number })
  Test.check<WithObject, 'empty' | LiteralPoint, Test.Pass>(),

  // WithBoth = 'none' | 'empty' | LiteralCoord | LiteralPoint
  Test.check<WithBoth, 'none' | 'empty' | LiteralCoord | LiteralPoint, Test.Pass>(),
]);

// =============================================================================
// Literal Input Types (uses Input variants for tuple/object)
// =============================================================================

Test.checks([
  // WithTupleInput = 'none' | LiteralCoordInput
  Test.check<WithTupleInput, 'none' | LiteralCoordInput, Test.Pass>(),

  // WithObjectInput = 'empty' | LiteralPointInput
  Test.check<WithObjectInput, 'empty' | LiteralPointInput, Test.Pass>(),

  // WithBothInput = 'none' | 'empty' | LiteralCoordInput | LiteralPointInput
  Test.check<WithBothInput, 'none' | 'empty' | LiteralCoordInput | LiteralPointInput, Test.Pass>(),
]);

// =============================================================================
// Literal Where Types
// =============================================================================

Test.checks([
  // WithTupleWhere has eq/neq/in/notIn (no numeric/string ops — mixed types)
  Test.check<Extends<{ eq?: WithTuple }, WithTupleWhere>, 1, Test.Pass>(),
  Test.check<Extends<{ neq?: WithTuple }, WithTupleWhere>, 1, Test.Pass>(),
  Test.check<Extends<{ in?: WithTuple[] }, WithTupleWhere>, 1, Test.Pass>(),
  Test.check<Extends<{ notIn?: WithTuple[] }, WithTupleWhere>, 1, Test.Pass>(),

  // WithObjectWhere has eq/neq/in/notIn
  Test.check<Extends<{ eq?: WithObject }, WithObjectWhere>, 1, Test.Pass>(),
  Test.check<Extends<{ neq?: WithObject }, WithObjectWhere>, 1, Test.Pass>(),
  Test.check<Extends<{ in?: WithObject[] }, WithObjectWhere>, 1, Test.Pass>(),

  // WithBothWhere has eq/neq/in/notIn
  Test.check<Extends<{ eq?: WithBoth }, WithBothWhere>, 1, Test.Pass>(),
  Test.check<Extends<{ in?: WithBoth[] }, WithBothWhere>, 1, Test.Pass>(),
]);

// =============================================================================
// Model Output Types — fields use literal output types
// =============================================================================

Test.checks([
  // LiteralWithTuple.payload is WithTuple (output)
  Test.check<LiteralWithTuple['payload'], WithTuple, Test.Pass>(),
  Test.check<LiteralWithTuple['id'], CerialId<string>, Test.Pass>(),

  // LiteralWithObjectVariant.payload is WithObject (output)
  Test.check<LiteralWithObjectVariant['payload'], WithObject, Test.Pass>(),

  // LiteralWithBoth.data is WithBoth (output)
  Test.check<LiteralWithBoth['data'], WithBoth, Test.Pass>(),
]);

// Optional fields
Test.checks([
  // optPayload is optional — can be WithTuple or undefined
  Test.check<Extends<undefined, LiteralWithTuple['optPayload']>, 1, Test.Pass>(),
  Test.check<Extends<WithTuple, NonNullable<LiteralWithTuple['optPayload']>>, 1, Test.Pass>(),

  Test.check<Extends<undefined, LiteralWithObjectVariant['optPayload']>, 1, Test.Pass>(),
  Test.check<Extends<WithObject, NonNullable<LiteralWithObjectVariant['optPayload']>>, 1, Test.Pass>(),

  Test.check<Extends<undefined, LiteralWithBoth['optData']>, 1, Test.Pass>(),
  Test.check<Extends<WithBoth, NonNullable<LiteralWithBoth['optData']>>, 1, Test.Pass>(),
]);

// Array fields
Test.checks([
  Test.check<LiteralWithTuple['payloads'], WithTuple[], Test.Pass>(),
  Test.check<LiteralWithObjectVariant['payloads'], WithObject[], Test.Pass>(),
]);

// =============================================================================
// Model Input Types — fields use literal input types
// =============================================================================

Test.checks([
  Test.check<LiteralWithTupleInput['payload'], WithTupleInput, Test.Pass>(),
  Test.check<LiteralWithObjectVariantInput['payload'], WithObjectInput, Test.Pass>(),
  Test.check<LiteralWithBothInput['data'], WithBothInput, Test.Pass>(),
]);

// =============================================================================
// Create Types — required fields mandatory, optional fields optional
// =============================================================================

Test.checks([
  // payload is required in create
  Test.check<Extends<{ payload: WithTupleInput }, LiteralWithTupleCreate>, 1, Test.Pass>(),
  Test.check<Extends<{ payload: WithObjectInput }, LiteralWithObjectVariantCreate>, 1, Test.Pass>(),
  Test.check<Extends<{ data: WithBothInput }, LiteralWithBothCreate>, 1, Test.Pass>(),
]);

// =============================================================================
// Update Types — optional field can be cleared with CerialNone
// =============================================================================

Test.checks([
  // optPayload in update accepts CerialNone
  Test.check<Extends<CerialNone, NonNullable<LiteralWithTupleUpdate['optPayload']>>, 1, Test.Pass>(),
  Test.check<Extends<CerialNone, NonNullable<LiteralWithObjectVariantUpdate['optPayload']>>, 1, Test.Pass>(),
  Test.check<Extends<CerialNone, NonNullable<LiteralWithBothUpdate['optData']>>, 1, Test.Pass>(),
]);

// =============================================================================
// Model Where Types — literal where on model fields
// =============================================================================

Test.checks([
  // payload field on model accepts direct value or Where object
  Test.check<Extends<{ payload?: WithTuple | WithTupleWhere }, ModelTupleWhere>, 1, Test.Pass>(),
  Test.check<Extends<{ payload?: WithObject | WithObjectWhere }, ModelObjWhere>, 1, Test.Pass>(),
  Test.check<Extends<{ data?: WithBoth | WithBothWhere }, ModelBothWhere>, 1, Test.Pass>(),
]);

// =============================================================================
// WithObjectOpt — Object variant with optional/nullable fields
// LiteralPointOpt = { label: string, count?: number, tag?: string | null }
// =============================================================================

// Output type
Test.checks([Test.check<WithObjectOpt, 'empty' | LiteralPointOpt, Test.Pass>()]);

// Input type
Test.checks([Test.check<WithObjectOptInput, 'empty' | LiteralPointOptInput, Test.Pass>()]);

// LiteralPointOpt — optional count, optional+nullable tag
Test.checks([
  Test.check<LiteralPointOpt['label'], string, Test.Pass>(),
  // count is optional (number | undefined)
  Test.check<Extends<undefined, LiteralPointOpt['count']>, 1, Test.Pass>(),
  Test.check<Extends<number, NonNullable<LiteralPointOpt['count']>>, 1, Test.Pass>(),
  // tag is optional+nullable (string | null | undefined)
  Test.check<Extends<undefined, LiteralPointOpt['tag']>, 1, Test.Pass>(),
  Test.check<Extends<null, NonNullable<LiteralPointOpt['tag']>>, 0, Test.Pass>(),
]);

// Model types
Test.checks([
  Test.check<LiteralWithObjectOpt['payload'], WithObjectOpt, Test.Pass>(),
  Test.check<Extends<undefined, LiteralWithObjectOpt['optPayload']>, 1, Test.Pass>(),
  Test.check<LiteralWithObjectOptInput['payload'], WithObjectOptInput, Test.Pass>(),
]);

// Create type — payload required, optPayload optional
Test.checks([Test.check<Extends<{ payload: WithObjectOptInput }, LiteralWithObjectOptCreate>, 1, Test.Pass>()]);

// Update type — optPayload can be cleared with CerialNone
Test.checks([Test.check<Extends<CerialNone, NonNullable<LiteralWithObjectOptUpdate['optPayload']>>, 1, Test.Pass>()]);

// Where type
Test.checks([Test.check<Extends<{ payload?: WithObjectOpt | WithObjectOptWhere }, ModelObjOptWhere>, 1, Test.Pass>()]);
