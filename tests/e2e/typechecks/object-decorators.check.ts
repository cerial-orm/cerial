/**
 * Type checks for object field decorators
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 *
 * Tests types generated for:
 * - @default and @now on object fields (ContactInfoCreateInput)
 * - @unique on object fields (ObjDecUserFindUniqueWhere)
 * - @index on object fields (no type impact, just verifies compilation)
 * - @distinct on object array fields (no type impact beyond array)
 */

import type { CerialId, RecordIdInput } from 'cerial';
import { Test } from 'ts-toolbelt';
import type {
  ContactInfo,
  ContactInfoCreateInput,
  ContactInfoInput,
  ContactInfoWhere,
  LocationInfo,
  LocationInfoInput,
  ObjDecUser,
  ObjDecUserCreate,
  ObjDecUserFindUniqueWhere,
  ObjDecUserUpdate,
  ObjDecUserWhere,
} from '../generated';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// ContactInfo Output Interface
// =============================================================================

// Required fields
Test.checks([
  Test.check<ContactInfo['email'], string, Test.Pass>(),
  Test.check<ContactInfo['city'], string, Test.Pass>(),
  Test.check<ContactInfo['tags'], string[], Test.Pass>(),
]);

// Optional fields (phone is explicitly optional, createdAt has @now)
Test.checks([
  Test.check<ContactInfo['phone'], string | null | undefined, Test.Pass>(),
  Test.check<ContactInfo['createdAt'], Date | undefined, Test.Pass>(),
]);

// =============================================================================
// ContactInfoInput Interface
// =============================================================================

// Same as output for non-Record objects
Test.checks([
  Test.check<ContactInfoInput['email'], string, Test.Pass>(),
  Test.check<ContactInfoInput['city'], string, Test.Pass>(),
  Test.check<ContactInfoInput['tags'], string[], Test.Pass>(),
  Test.check<ContactInfoInput['phone'], string | null | undefined, Test.Pass>(),
  Test.check<ContactInfoInput['createdAt'], Date | undefined, Test.Pass>(),
]);

// =============================================================================
// ContactInfoCreateInput Interface — @default/@now fields become optional
// =============================================================================

// email remains required (no @default or @now)
Test.checks([Test.check<ContactInfoCreateInput['email'], string, Test.Pass>()]);

// city has @default("Unknown") — becomes optional in CreateInput (no null without @nullable)
Test.checks([Test.check<ContactInfoCreateInput['city'], string | undefined, Test.Pass>()]);

// createdAt has @createdAt — becomes optional in CreateInput (no null without @nullable)
Test.checks([Test.check<ContactInfoCreateInput['createdAt'], Date | undefined, Test.Pass>()]);

// tags is array with @distinct — arrays are optional in create (default [])
Test.checks([Test.check<ContactInfoCreateInput['tags'], string[] | undefined, Test.Pass>()]);

// phone is already optional — stays optional
Test.checks([Test.check<ContactInfoCreateInput['phone'], string | null | undefined, Test.Pass>()]);

// Verify CreateInput is accepted where a minimal create payload is needed
Test.checks([
  // Minimal create: just email (everything else has default or is optional)
  Test.check<Extends<{ email: string }, ContactInfoCreateInput>, 1, Test.Pass>(),
  // Full create: all fields specified
  Test.check<
    Extends<{ email: string; phone: string; city: string; createdAt: Date; tags: string[] }, ContactInfoCreateInput>,
    1,
    Test.Pass
  >(),
]);

// =============================================================================
// LocationInfo Interface — no @default/@now, so no CreateInput
// =============================================================================

Test.checks([
  Test.check<LocationInfo['address'], string, Test.Pass>(),
  Test.check<LocationInfo['zip'], string, Test.Pass>(),
  Test.check<LocationInfo['country'], string, Test.Pass>(),
]);

// LocationInfoInput same fields
Test.checks([
  Test.check<LocationInfoInput['address'], string, Test.Pass>(),
  Test.check<LocationInfoInput['zip'], string, Test.Pass>(),
  Test.check<LocationInfoInput['country'], string, Test.Pass>(),
]);

// Verify LocationInfoCreateInput does NOT exist (no @default or @now)
Test.checks([
  Test.check<'LocationInfoCreateInput' extends keyof typeof import('../generated') ? 1 : 0, 0, Test.Pass>(),
]);

// =============================================================================
// ObjDecUser Model Interface
// =============================================================================

Test.checks([
  Test.check<ObjDecUser['id'], CerialId<string>, Test.Pass>(),
  Test.check<ObjDecUser['name'], string, Test.Pass>(),
  Test.check<ObjDecUser['contact'], ContactInfo, Test.Pass>(),
  Test.check<ObjDecUser['location'], LocationInfo, Test.Pass>(),
  // altLocation is optional object — no null, just undefined
  Test.check<ObjDecUser['altLocation'], LocationInfo | undefined, Test.Pass>(),
]);

// =============================================================================
// ObjDecUserCreate — uses ContactInfoCreateInput
// =============================================================================

// contact uses CreateInput (since ContactInfo has @default/@now)
Test.checks([
  // Minimal create: name + email-only contact + full location
  Test.check<
    Extends<
      {
        name: string;
        contact: { email: string };
        location: { address: string; zip: string; country: string };
      },
      ObjDecUserCreate
    >,
    1,
    Test.Pass
  >(),
]);

// Full create with all fields
Test.checks([
  Test.check<
    Extends<
      {
        name: string;
        contact: { email: string; phone: string; city: string; createdAt: Date; tags: string[] };
        location: { address: string; zip: string; country: string };
        altLocation: { address: string; zip: string; country: string };
      },
      ObjDecUserCreate
    >,
    1,
    Test.Pass
  >(),
]);

// location uses LocationInfoInput (NOT CreateInput since no @default/@now)
// So all LocationInfo fields remain required in create
Test.checks([
  // Missing zip should fail
  Test.check<
    Extends<
      { name: string; contact: { email: string }; location: { address: string; country: string } },
      ObjDecUserCreate
    >,
    0,
    Test.Pass
  >(),
]);

// =============================================================================
// ObjDecUserFindUniqueWhere — object @unique variants
// =============================================================================

// By id
Test.checks([Test.check<Extends<{ id: RecordIdInput<string> }, ObjDecUserFindUniqueWhere>, 1, Test.Pass>()]);

// By location.zip (nested syntax)
Test.checks([Test.check<Extends<{ location: { zip: string } }, ObjDecUserFindUniqueWhere>, 1, Test.Pass>()]);

// By altLocation.zip (nested syntax)
Test.checks([Test.check<Extends<{ altLocation: { zip: string } }, ObjDecUserFindUniqueWhere>, 1, Test.Pass>()]);

// With additional where filters
Test.checks([
  Test.check<Extends<{ location: { zip: string }; name: string }, ObjDecUserFindUniqueWhere>, 1, Test.Pass>(),
]);

// Object unique keys are omitted from the Omit in each union variant,
// preventing them from appearing as additional filters within the same variant.
// Note: structurally, { id: ...; location: ... } still extends the union
// because TS `extends` doesn't enforce excess property checks, but at the
// call site, excess property checking will catch this at usage.
// Verify that the omit keys include both location and altLocation
Test.checks([
  // The id variant omits location and altLocation
  Test.check<
    Extends<
      { id: RecordIdInput<string> } & Omit<ObjDecUserWhere, 'id' | 'location' | 'altLocation'>,
      ObjDecUserFindUniqueWhere
    >,
    1,
    Test.Pass
  >(),
]);

// =============================================================================
// ObjDecUserUpdate — object field update operations
// =============================================================================

// Partial merge for contact
Test.checks([
  Test.check<Extends<{ contact: { phone: string } }, ObjDecUserUpdate>, 1, Test.Pass>(),
  Test.check<Extends<{ contact: { city: string } }, ObjDecUserUpdate>, 1, Test.Pass>(),
]);

// Set replace for contact
Test.checks([Test.check<Extends<{ contact: { set: ContactInfoInput } }, ObjDecUserUpdate>, 1, Test.Pass>()]);

// Partial merge for location
Test.checks([Test.check<Extends<{ location: { address: string } }, ObjDecUserUpdate>, 1, Test.Pass>()]);

// Set replace for location
Test.checks([Test.check<Extends<{ location: { set: LocationInfoInput } }, ObjDecUserUpdate>, 1, Test.Pass>()]);

// =============================================================================
// ObjDecUserWhere — object sub-field filtering
// =============================================================================

// Filter by contact sub-fields
Test.checks([
  Test.check<Extends<{ contact: { email: string } }, ObjDecUserWhere>, 1, Test.Pass>(),
  Test.check<Extends<{ contact: { city: string } }, ObjDecUserWhere>, 1, Test.Pass>(),
]);

// Filter by location sub-fields
Test.checks([
  Test.check<Extends<{ location: { zip: string } }, ObjDecUserWhere>, 1, Test.Pass>(),
  Test.check<Extends<{ location: { country: string } }, ObjDecUserWhere>, 1, Test.Pass>(),
]);

// ContactInfoWhere has operators for tags (array field)
Test.checks([
  Test.check<Extends<{ tags: { has: string } }, ContactInfoWhere>, 1, Test.Pass>(),
  Test.check<Extends<{ tags: { hasAll: string[] } }, ContactInfoWhere>, 1, Test.Pass>(),
  Test.check<Extends<{ tags: { hasAny: string[] } }, ContactInfoWhere>, 1, Test.Pass>(),
  Test.check<Extends<{ tags: { isEmpty: boolean } }, ContactInfoWhere>, 1, Test.Pass>(),
]);

// ContactInfoWhere has Date operators for createdAt
type CreatedAtWhere = Exclude<ContactInfoWhere['createdAt'], Date | null | undefined>;
Test.checks([
  Test.check<Extends<CreatedAtWhere, { gt?: Date }>, 1, Test.Pass>(),
  Test.check<Extends<CreatedAtWhere, { gte?: Date }>, 1, Test.Pass>(),
  Test.check<Extends<CreatedAtWhere, { lt?: Date }>, 1, Test.Pass>(),
  Test.check<Extends<CreatedAtWhere, { lte?: Date }>, 1, Test.Pass>(),
  Test.check<Extends<CreatedAtWhere, { between?: [Date, Date] }>, 1, Test.Pass>(),
]);
