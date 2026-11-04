/**
 * Hover documentation for .cerial files.
 *
 * The list of decorators and field types, and each entry's one-line description, come from the parser
 * registry. This file adds only what the registry does not carry: the TypeScript and SurrealDB type of
 * a field type, and an example and constraints for a decorator. Both maps are keyed by registry name,
 * and a unit test fails when a key is not a registry entry.
 */

import { DECORATOR_REGISTRY, type DecoratorEntry, FIELD_TYPE_REGISTRY } from '../../../../orm/src/parser/registry';

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

/** Extra hover detail for a decorator that its registry entry does not hold. */
export interface DecoratorDetail {
  example?: string;
  constraints?: string;
}

/** TypeScript and SurrealDB types shown for a field type; the registry holds neither. */
export interface FieldTypeDetail {
  tsType: string;
  surrealType: string;
}

// ---------------------------------------------------------------------------
// Detail not held by the registry, keyed by registry name
// ---------------------------------------------------------------------------

export const FIELD_TYPE_DETAIL: Readonly<Record<string, FieldTypeDetail>> = {
  String: { tsType: 'string', surrealType: 'string' },
  Int: { tsType: 'number', surrealType: 'int' },
  Float: { tsType: 'number', surrealType: 'float' },
  Bool: { tsType: 'boolean', surrealType: 'bool' },
  Date: { tsType: 'Date', surrealType: 'datetime' },
  Email: { tsType: 'string', surrealType: 'string' },
  Record: { tsType: 'CerialId', surrealType: 'record' },
  Relation: { tsType: '(virtual)', surrealType: '(virtual)' },
  Uuid: { tsType: 'CerialUuid', surrealType: 'uuid' },
  Duration: { tsType: 'CerialDuration', surrealType: 'duration' },
  Decimal: { tsType: 'CerialDecimal', surrealType: 'decimal' },
  Bytes: { tsType: 'CerialBytes', surrealType: 'bytes' },
  Geometry: { tsType: 'CerialGeometry', surrealType: 'geometry' },
  Any: { tsType: 'CerialAny', surrealType: 'any' },
  Number: { tsType: 'number', surrealType: 'number' },
};

export const DECORATOR_DETAIL: Readonly<Record<string, DecoratorDetail>> = {
  '@id': { example: 'id Record @id', constraints: 'Exactly one per model. Must be a Record field.' },
  '@unique': { example: 'email Email @unique' },
  '@default': {
    example: 'name String @default("anonymous")',
    constraints: 'Mutually exclusive with @defaultAlways, @createdAt, @updatedAt, @now, @uuid/@uuid4/@uuid7.',
  },
  '@defaultAlways': {
    example: 'status String @defaultAlways("active")',
    constraints: 'Mutually exclusive with @default, @createdAt, @updatedAt, @now.',
  },
  '@nullable': {
    example: 'bio String? @nullable',
    constraints: 'Not allowed on object/tuple fields. `@default(null)` requires @nullable.',
  },
  '@readonly': {
    example: 'creatorId Record @readonly',
    constraints: 'Incompatible with @now, @defaultAlways, and @id.',
  },
  '@flexible': { example: 'metadata Metadata @flexible', constraints: 'Only allowed on object-typed fields.' },
  '@set': {
    example: 'tags String[] @set',
    constraints: 'Not allowed on Object[], Tuple[], Record[]. Mutually exclusive with @distinct/@sort.',
  },
  '@distinct': {
    example: 'categories String[] @distinct',
    constraints: 'Array fields only. Mutually exclusive with @set.',
  },
  '@sort': {
    example: 'scores Int[] @sort(desc)',
    constraints:
      'With no argument, true or asc it sorts ascending; false or desc sorts descending. Array fields only. Mutually exclusive with @set. Any other argument is a generation error.',
  },
  '@createdAt': {
    example: 'createdAt Date @createdAt',
    constraints: 'Date fields only. Mutually exclusive with @updatedAt, @now, @default, @defaultAlways.',
  },
  '@updatedAt': {
    example: 'updatedAt Date @updatedAt',
    constraints: 'Date fields only. Mutually exclusive with @createdAt, @now, @default, @defaultAlways.',
  },
  '@now': {
    example: 'currentTime Date @now',
    constraints: 'Date fields only. Model-level only (not objects). Excluded from Create/Update/Where.',
  },
  '@field': {
    example: 'author Relation @field(authorId) @model(User)',
    constraints: 'Required on PK (forward) relations. The referenced field must be a Record type.',
  },
  '@model': { example: 'posts Relation[] @model(Post)', constraints: 'Required on all Relation fields.' },
  '@onDelete': {
    example: 'author Relation? @field(authorId) @model(User) @onDelete(SetNull)',
    constraints: 'Only on optional Relation? fields. Required relations auto-cascade.',
  },
  '@key': { example: 'tagIds Record[] @key', constraints: 'Only on Record[] fields in N:N relations.' },
  '@index': { example: 'name String @index' },
  '@uuid': {
    example: 'trackingId Uuid @uuid',
    constraints:
      'Uuid fields only. Model + object fields only (not tuples). Mutually exclusive with @uuid4, @uuid7, @default, @defaultAlways.',
  },
  '@uuid4': {
    example: 'legacyId Uuid @uuid4',
    constraints:
      'Uuid fields only. Model + object fields only (not tuples). Mutually exclusive with @uuid, @uuid7, @default, @defaultAlways.',
  },
  '@uuid7': {
    example: 'requestId Uuid @uuid7',
    constraints:
      'Uuid fields only. Model + object fields only (not tuples). Mutually exclusive with @uuid, @uuid4, @default, @defaultAlways.',
  },
  '@point': {
    example: 'location Geometry @point',
    constraints: 'Geometry fields only. Combinable with other geometry subtype decorators.',
  },
  '@line': {
    example: 'route Geometry @line',
    constraints: 'Geometry fields only. Combinable with other geometry subtype decorators.',
  },
  '@polygon': {
    example: 'boundary Geometry @polygon',
    constraints: 'Geometry fields only. Combinable with other geometry subtype decorators.',
  },
  '@multipoint': {
    example: 'stops Geometry @multipoint',
    constraints: 'Geometry fields only. Combinable with other geometry subtype decorators.',
  },
  '@multiline': {
    example: 'trails Geometry @multiline',
    constraints: 'Geometry fields only. Combinable with other geometry subtype decorators.',
  },
  '@multipolygon': {
    example: 'regions Geometry @multipolygon',
    constraints: 'Geometry fields only. Combinable with other geometry subtype decorators.',
  },
  '@geoCollection': {
    example: 'shapes Geometry @geoCollection',
    constraints: 'Geometry fields only. Combinable with other geometry subtype decorators.',
  },
};

/** The signature as written in a schema, derived from the argument shape. */
function signatureOf(entry: DecoratorEntry): string {
  const { args, name } = entry;
  switch (args.kind) {
    case 'none':
      return name;
    case 'choice': {
      const call = `${name}(${args.choices.join(' | ')})`;

      return args.optional ? `${name} | ${call}` : call;
    }
    case 'name':
      return `${name}(${name.replace(/^@+/, '')}Name)`;
    case 'literal':
      return `${name}(value)`;
    case 'nameAndFields':
      return `${name}(name, [field1, field2])`;
  }
}

/** Field type docs by type name as written in a schema (`String`, `Record`). */
export const FIELD_TYPE_DOCS: Readonly<Record<string, FieldTypeDoc>> = Object.fromEntries(
  [...FIELD_TYPE_REGISTRY.values()].map((entry): [string, FieldTypeDoc] => {
    const detail = FIELD_TYPE_DETAIL[entry.name];

    return [
      entry.name,
      { tsType: detail?.tsType ?? '', surrealType: detail?.surrealType ?? '', description: entry.description },
    ];
  }),
);

/**
 * Decorator docs keyed by the name with its first `@` removed: `unique` for `@unique`, `@unique` for
 * the model-level `@@unique`. That is the key the hover provider looks up.
 */
export const DECORATOR_DOCS: Readonly<Record<string, DecoratorDoc>> = Object.fromEntries(
  [...DECORATOR_REGISTRY.values()].map((entry): [string, DecoratorDoc] => {
    const detail = DECORATOR_DETAIL[entry.name];

    return [
      entry.name.slice(1),
      {
        signature: signatureOf(entry),
        description: entry.description,
        ...(detail?.example && { example: detail.example }),
        ...(detail?.constraints && { constraints: detail.constraints }),
      },
    ];
  }),
);
