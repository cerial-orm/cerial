/**
 * Static documentation data for hover tooltips in .cerial files.
 *
 * Provides rich Markdown content for field types, decorators,
 * and other schema constructs.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Documentation for a field type */
export interface FieldTypeDoc {
  tsType: string;
  surrealType: string;
  description: string;
}

/** Documentation for a decorator */
export interface DecoratorDoc {
  signature: string;
  description: string;
  example?: string;
  constraints?: string;
}

// ---------------------------------------------------------------------------
// Field Type Documentation
// ---------------------------------------------------------------------------

export const FIELD_TYPE_DOCS: Record<string, FieldTypeDoc> = {
  String: {
    tsType: 'string',
    surrealType: 'string',
    description: 'Text string value',
  },
  Int: {
    tsType: 'number',
    surrealType: 'int',
    description: 'Integer number',
  },
  Float: {
    tsType: 'number',
    surrealType: 'float',
    description: 'Floating-point number (IEEE 754)',
  },
  Bool: {
    tsType: 'boolean',
    surrealType: 'bool',
    description: 'Boolean true/false',
  },
  Date: {
    tsType: 'Date',
    surrealType: 'datetime',
    description: 'Date/time value',
  },
  Email: {
    tsType: 'string',
    surrealType: 'string',
    description: 'Validated email address',
  },
  Record: {
    tsType: 'CerialId',
    surrealType: 'record',
    description: 'Record reference (table:id)',
  },
  Relation: {
    tsType: '(virtual)',
    surrealType: '(virtual)',
    description: 'Virtual relation field — not stored in DB',
  },
  Uuid: {
    tsType: 'CerialUuid',
    surrealType: 'uuid',
    description: 'UUID identifier',
  },
  Duration: {
    tsType: 'CerialDuration',
    surrealType: 'duration',
    description: 'Time duration (e.g. 2h30m15s)',
  },
  Decimal: {
    tsType: 'CerialDecimal',
    surrealType: 'decimal',
    description: 'Arbitrary-precision decimal number',
  },
  Bytes: {
    tsType: 'CerialBytes',
    surrealType: 'bytes',
    description: 'Binary data',
  },
  Geometry: {
    tsType: 'CerialGeometry',
    surrealType: 'geometry',
    description: 'Geospatial data (7 subtypes)',
  },
  Any: {
    tsType: 'CerialAny',
    surrealType: 'any',
    description: 'Any SurrealDB value',
  },
  Number: {
    tsType: 'number',
    surrealType: 'number',
    description: 'Auto-detect numeric type (int or float)',
  },
};

// ---------------------------------------------------------------------------
// Decorator Documentation
// ---------------------------------------------------------------------------

export const DECORATOR_DOCS: Record<string, DecoratorDoc> = {
  id: {
    signature: '@id',
    description: 'Marks the primary key field of a model.',
    example: 'id Record @id',
    constraints: 'Exactly one per model. Must be a Record field.',
  },
  unique: {
    signature: '@unique',
    description: 'Creates a unique index on the field. Duplicate values are rejected.',
    example: 'email Email @unique',
  },
  default: {
    signature: '@default(value)',
    description: 'Sets a default value when the field is absent on creation.',
    example: 'name String @default("anonymous")',
    constraints: 'Mutually exclusive with @defaultAlways, @createdAt, @updatedAt, @now, @uuid/@uuid4/@uuid7.',
  },
  defaultAlways: {
    signature: '@defaultAlways(value)',
    description: 'Resets the field to the given value on every create/update when absent.',
    example: 'status String @defaultAlways("active")',
    constraints: 'Mutually exclusive with @default, @createdAt, @updatedAt, @now.',
  },
  nullable: {
    signature: '@nullable',
    description: 'Allows the field to hold an explicit `null` value (distinct from absent/NONE).',
    example: 'bio String? @nullable',
    constraints: 'Not allowed on object/tuple fields. `@default(null)` requires @nullable.',
  },
  readonly: {
    signature: '@readonly',
    description: 'Write-once field — settable on create but excluded from update types.',
    example: 'creatorId Record @readonly',
    constraints: 'Incompatible with @now, @defaultAlways, and @id.',
  },
  flexible: {
    signature: '@flexible',
    description: 'Allows additional arbitrary keys on an object-typed field beyond the defined schema.',
    example: 'metadata Metadata @flexible',
    constraints: 'Only allowed on object-typed fields.',
  },
  set: {
    signature: '@set',
    description: 'Generates `set<T>` instead of `array<T>` — auto-deduplicates and sorts at DB level.',
    example: 'tags String[] @set',
    constraints: 'Not allowed on Decimal[], Object[], Tuple[], Record[]. Mutually exclusive with @distinct/@sort.',
  },
  distinct: {
    signature: '@distinct',
    description: 'Removes duplicate values from array fields at the application level.',
    example: 'categories String[] @distinct',
    constraints: 'Array fields only. Mutually exclusive with @set.',
  },
  sort: {
    signature: '@sort',
    description: 'Sorts array field values.',
    example: 'scores Int[] @sort',
    constraints: 'Array fields only. Mutually exclusive with @set.',
  },
  createdAt: {
    signature: '@createdAt',
    description: 'Sets the field to `time::now()` on creation when absent. `DEFAULT time::now()`.',
    example: 'createdAt Date @createdAt',
    constraints: 'Date fields only. Mutually exclusive with @updatedAt, @now, @default, @defaultAlways.',
  },
  updatedAt: {
    signature: '@updatedAt',
    description: 'Sets the field to `time::now()` on every create/update. `DEFAULT ALWAYS time::now()`.',
    example: 'updatedAt Date @updatedAt',
    constraints: 'Date fields only. Mutually exclusive with @createdAt, @now, @default, @defaultAlways.',
  },
  now: {
    signature: '@now',
    description: 'Computed `time::now()` — not stored, computed at query time. Output-only.',
    example: 'currentTime Date @now',
    constraints: 'Date fields only. Model-level only (not objects). Excluded from Create/Update/Where.',
  },
  field: {
    signature: '@field(fieldName)',
    description: 'Specifies the foreign key field for the forward side of a relation.',
    example: 'author Relation @field(authorId) @model(User)',
    constraints: 'Required on PK (forward) relations. The referenced field must be a Record type.',
  },
  model: {
    signature: '@model(ModelName)',
    description: 'Specifies the target model for a relation.',
    example: 'posts Relation[] @model(Post)',
    constraints: 'Required on all Relation fields.',
  },
  onDelete: {
    signature: '@onDelete(Action)',
    description:
      'Specifies the action when the referenced record is deleted. Actions: Cascade, SetNull, SetNone, Restrict, NoAction.',
    example: 'author Relation? @field(authorId) @model(User) @onDelete(SetNull)',
    constraints: 'Only on optional Relation? fields. Required relations auto-cascade.',
  },
  key: {
    signature: '@key',
    description: 'Marks the foreign key field used for N:N relation matching. Required on one side of N:N relations.',
    example: 'tagIds Record[] @key',
    constraints: 'Only on Record[] fields in N:N relations.',
  },
  index: {
    signature: '@index',
    description: 'Creates a non-unique index on the field for faster lookups.',
    example: 'name String @index',
  },
  uuid: {
    signature: '@uuid',
    description: 'Auto-generates a UUID v7 on creation. `DEFAULT rand::uuid::v7()`.',
    example: 'trackingId Uuid @uuid',
    constraints:
      'Uuid fields only. Model + object fields only (not tuples). Mutually exclusive with @uuid4, @uuid7, @default, @defaultAlways.',
  },
  uuid4: {
    signature: '@uuid4',
    description: 'Auto-generates a UUID v4 on creation. `DEFAULT rand::uuid()`.',
    example: 'legacyId Uuid @uuid4',
    constraints:
      'Uuid fields only. Model + object fields only (not tuples). Mutually exclusive with @uuid, @uuid7, @default, @defaultAlways.',
  },
  uuid7: {
    signature: '@uuid7',
    description: 'Auto-generates a UUID v7 on creation. `DEFAULT rand::uuid::v7()`.',
    example: 'requestId Uuid @uuid7',
    constraints:
      'Uuid fields only. Model + object fields only (not tuples). Mutually exclusive with @uuid, @uuid4, @default, @defaultAlways.',
  },
  point: {
    signature: '@point',
    description: 'Restricts geometry field to Point subtype.',
    example: 'location Geometry @point',
    constraints: 'Geometry fields only. Combinable with other geometry subtype decorators.',
  },
  line: {
    signature: '@line',
    description: 'Restricts geometry field to LineString subtype.',
    example: 'route Geometry @line',
    constraints: 'Geometry fields only. Combinable with other geometry subtype decorators.',
  },
  polygon: {
    signature: '@polygon',
    description: 'Restricts geometry field to Polygon subtype.',
    example: 'boundary Geometry @polygon',
    constraints: 'Geometry fields only. Combinable with other geometry subtype decorators.',
  },
  multipoint: {
    signature: '@multipoint',
    description: 'Restricts geometry field to MultiPoint subtype.',
    example: 'stops Geometry @multipoint',
    constraints: 'Geometry fields only. Combinable with other geometry subtype decorators.',
  },
  multiline: {
    signature: '@multiline',
    description: 'Restricts geometry field to MultiLineString subtype.',
    example: 'trails Geometry @multiline',
    constraints: 'Geometry fields only. Combinable with other geometry subtype decorators.',
  },
  multipolygon: {
    signature: '@multipolygon',
    description: 'Restricts geometry field to MultiPolygon subtype.',
    example: 'regions Geometry @multipolygon',
    constraints: 'Geometry fields only. Combinable with other geometry subtype decorators.',
  },
  geoCollection: {
    signature: '@geoCollection',
    description: 'Restricts geometry field to GeometryCollection subtype.',
    example: 'shapes Geometry @geoCollection',
    constraints: 'Geometry fields only. Combinable with other geometry subtype decorators.',
  },
};
