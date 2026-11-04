/**
 * Type mapper for converting schema types to SurrealQL types
 */

import type {
  FieldMetadata,
  LiteralFieldMetadata,
  LiteralRegistry,
  ModelMetadata,
  ObjectFieldMetadata,
  ObjectRegistry,
  ResolvedLiteralVariant,
  SchemaFieldType,
  TupleElementMetadata,
  TupleFieldMetadata,
  TupleRegistry,
} from '../../types';
import { SIZED_NUMBER_SURREAL_TYPES } from '../../utils/type-utils';
import { escapeSurqlString } from '../shared';

/** SurrealQL type string */
export type SurrealQLType =
  | 'string'
  | 'int'
  | 'float'
  | 'number'
  | 'bool'
  | 'datetime'
  | 'uuid'
  | 'record'
  | 'array'
  | 'object'
  | 'literal'
  | 'duration'
  | 'decimal'
  | 'bytes'
  | 'geometry'
  | 'any'
  | 'i8'
  | 'u8'
  | 'i16'
  | 'u16'
  | 'i32'
  | 'u32'
  | 'u64'
  | 'f16'
  | 'f32';

/** Mapping from schema types to SurrealQL types */
const TYPE_MAP: Record<SchemaFieldType, SurrealQLType> = {
  ...(SIZED_NUMBER_SURREAL_TYPES as Record<keyof typeof SIZED_NUMBER_SURREAL_TYPES, SurrealQLType>),
  string: 'string',
  email: 'string',
  int: 'int',
  float: 'float',
  number: 'number',
  bool: 'bool',
  date: 'datetime',
  record: 'record',
  relation: 'string', // Virtual type - should not be used directly
  object: 'object', // Embedded object type
  tuple: 'array', // Tuple type - actual type is literal array [type1, type2, ...]
  literal: 'literal', // Literal type - actual type is union of variants
  uuid: 'uuid',
  duration: 'duration',
  decimal: 'decimal',
  bytes: 'bytes',
  geometry: 'geometry',
  any: 'any',
} as Record<SchemaFieldType, SurrealQLType>;

/** Schema types that require additional assertions */
const TYPE_ASSERTIONS: Partial<Record<SchemaFieldType, string>> = {
  email: 'string::is_email($value)',
};

/** Map a schema field type to SurrealQL type */
export function mapToSurrealType(schemaType: SchemaFieldType): SurrealQLType {
  return TYPE_MAP[schemaType] ?? 'string';
}

/** Get assertion for a schema field type, if any */
export function getTypeAssertion(schemaType: SchemaFieldType): string | undefined {
  return TYPE_ASSERTIONS[schemaType];
}

/** Check if a schema type requires an assertion */
export function hasTypeAssertion(schemaType: SchemaFieldType): boolean {
  return schemaType in TYPE_ASSERTIONS;
}

/**
 * Find the target table for a Record field by looking for its paired Relation
 */
export function findRecordTargetTable(field: FieldMetadata, model: ModelMetadata): string | undefined {
  // Find a Relation field that references this Record field
  const pairedRelation = model.fields.find((f) => f.type === 'relation' && f.relationInfo?.fieldRef === field.name);

  if (pairedRelation?.relationInfo) {
    return pairedRelation.relationInfo.targetTable;
  }

  return undefined;
}

/**
 * Wrap a SurrealQL type with option/null based on nullable/optional flags.
 *
 * Semantics:
 * - Required + not nullable: `T`
 * - Required + nullable: `T | null`
 * - Optional + not nullable: `option<T>`
 * - Optional + nullable: `option<T | null>`
 */
function wrapTypeModifiers(baseType: string, isRequired: boolean, isNullable?: boolean): string {
  if (isRequired && !isNullable) return baseType;
  if (isRequired && isNullable) return `${baseType} | null`;
  if (!isRequired && !isNullable) return `option<${baseType}>`;

  return `option<${baseType} | null>`;
}

/** Map a broad type name to its SurrealQL equivalent */
function broadTypeToSurreal(typeName: string): string {
  const map: Record<string, string> = {
    String: 'string',
    Int: 'int',
    Float: 'float',
    Bool: 'bool',
    Date: 'datetime',
  };

  return map[typeName] ?? 'string';
}

/** Generate the SurrealQL type string for a single literal variant */
function variantToSurrealType(
  variant: ResolvedLiteralVariant,
  tupleRegistry?: TupleRegistry,
  state?: InlineTypeState,
): string {
  switch (variant.kind) {
    case 'string':
      return `'${escapeSurqlString(variant.value)}'`;
    case 'int':
    case 'float':
      return `${variant.value}`;
    case 'bool':
      return `${variant.value}`;
    case 'broadType':
      return broadTypeToSurreal(variant.typeName);
    case 'tupleRef':
      return generateTupleSurrealTypeLiteral(variant.tupleInfo, tupleRegistry, state);
    case 'objectRef':
      return generateObjectSurrealTypeLiteral(variant.objectInfo, tupleRegistry, state);
  }
}

/**
 * Records whether an inline type holds a bare `object`. SurrealDB 4.0 keeps an `object` member of a
 * tuple or literal type strict unless the owning field is `FLEXIBLE`, and refuses `FLEXIBLE` on a type
 * that holds no `object`, so the field gets the clause only when this is set.
 */
export interface InlineTypeState {
  flexible: boolean;
}

/**
 * Render an object inside an inline type. A `@flexible` or self-referencing object cannot be written as
 * a literal (a literal is always strict, and a cycle has no finite literal), so it is a bare `object`
 * and the owning field becomes `FLEXIBLE`; the ORM validator checks its declared keys.
 */
function inlineObjectType(
  objectInfo: ObjectFieldMetadata,
  flexible: boolean | undefined,
  tupleRegistry: TupleRegistry | undefined,
  state: InlineTypeState | undefined,
  visited: ReadonlySet<string>,
): string {
  if (flexible || visited.has(objectInfo.objectName) || !objectInfo.fields.length) {
    if (state) state.flexible = true;

    return 'object';
  }

  const nested = new Set(visited).add(objectInfo.objectName);
  const fieldParts = objectInfo.fields
    // A @now field is COMPUTED, which only a top-level field can be, so it has no place in a value
    .filter((field) => field.timestampDecorator !== 'now')
    .map((field) => `${field.name}: ${generateObjectFieldSurrealType(field, tupleRegistry, state, nested)}`);

  return `{ ${fieldParts.join(', ')} }`;
}

/**
 * Generate the inline SurrealQL object type literal for an object variant in a literal or an object
 * element of a tuple. Produces `{ fieldName: type, ... }` with proper optional/nullable modifiers.
 *
 * Only type-level modifiers (optional, @nullable) are expressed. Decorators like @default,
 * @createdAt, @readonly cannot be represented in inline type syntax, so a sub-field default is a
 * required key that the ORM fills on write.
 */
export function generateObjectSurrealTypeLiteral(
  objectInfo: ObjectFieldMetadata,
  tupleRegistry?: TupleRegistry,
  state?: InlineTypeState,
  visited: ReadonlySet<string> = new Set(),
): string {
  return inlineObjectType(objectInfo, false, tupleRegistry, state, visited);
}

/**
 * Generate the SurrealQL type for a single field inside an inline object literal.
 * Handles primitives, arrays, literal-typed, object and tuple sub-fields.
 */
function generateObjectFieldSurrealType(
  field: FieldMetadata,
  tupleRegistry: TupleRegistry | undefined,
  state: InlineTypeState | undefined,
  visited: ReadonlySet<string>,
): string {
  let baseType: string;
  if (field.type === 'literal' && field.literalInfo) {
    baseType = generateLiteralSurrealType(field.literalInfo, tupleRegistry, state);
  } else if (field.type === 'object' && field.objectInfo) {
    baseType = inlineObjectType(field.objectInfo, field.isFlexible, tupleRegistry, state, visited);
  } else if (field.type === 'tuple' && field.tupleInfo) {
    baseType = generateTupleSurrealTypeLiteral(field.tupleInfo, tupleRegistry, state, visited);
  } else {
    baseType = mapToSurrealType(field.type);
  }

  if (field.isArray) return `array<${baseType}>`;

  return wrapTypeModifiers(baseType, field.isRequired, field.isNullable);
}

/** Generate the pipe-separated union type string for a literal field */
export function generateLiteralSurrealType(
  literalInfo: LiteralFieldMetadata,
  tupleRegistry?: TupleRegistry,
  state?: InlineTypeState,
): string {
  return literalInfo.variants.map((v) => variantToSurrealType(v, tupleRegistry, state)).join(' | ');
}

/**
 * Generate the TYPE clause for a field
 * Handles Record and Record[] with proper record<table> syntax
 * Handles primitive arrays like String[], Int[], Date[]
 *
 * NONE vs null semantics:
 * - `field?` → `option<T>` (NONE only — field absent or typed value)
 * - `field @nullable` → `T | null` (null only — required but can be null)
 * - `field? @nullable` → `option<T | null>` (both NONE and null)
 */
export function generateTypeClause(
  schemaType: SchemaFieldType,
  isRequired: boolean,
  field?: FieldMetadata,
  model?: ModelMetadata,
  tupleRegistry?: TupleRegistry,
  _literalRegistry?: LiteralRegistry,
): string {
  const isNullable = field?.isNullable;

  // Any type — TYPE any accepts all values including NONE and null natively
  // No need for option<any> or any | null wrappers
  if (schemaType === 'any') return 'TYPE any';

  // Handle Record types with target table
  if (schemaType === 'record' && field && model) {
    const targetTable = findRecordTargetTable(field, model);

    if (targetTable) {
      // Array Record type: array<record<table>> or set<record<table>>
      if (field.isArray) {
        const containerType = field.isSet ? 'set' : 'array';

        return `TYPE ${containerType}<record<${targetTable}>>`;
      }

      // Single Record type with nullable/optional modifiers
      return `TYPE ${wrapTypeModifiers(`record<${targetTable}>`, isRequired, isNullable)}`;
    }

    // Fallback if no target table found
    if (field.isArray) {
      const containerType = field.isSet ? 'set' : 'array';

      return `TYPE ${containerType}<record>`;
    }

    return `TYPE ${wrapTypeModifiers('record', isRequired, isNullable)}`;
  }

  // Handle tuple types — emit typed array literal [type1, type2, ...]
  if (schemaType === 'tuple' && field?.tupleInfo) {
    const tupleLiteral = generateTupleSurrealTypeLiteral(field.tupleInfo, tupleRegistry);

    if (field.isArray) {
      const containerType = field.isSet ? 'set' : 'array';

      return `TYPE ${containerType}<${tupleLiteral}>`;
    }

    // Tuples can be @nullable (unlike objects) — SurrealDB supports `[T, T] | null`
    return `TYPE ${wrapTypeModifiers(tupleLiteral, isRequired, isNullable)}`;
  }

  // Handle literal types — emit pipe-separated union of variant types
  if (schemaType === 'literal' && field?.literalInfo) {
    const literalUnion = generateLiteralSurrealType(field.literalInfo, tupleRegistry);

    if (field.isArray) {
      const containerType = field.isSet ? 'set' : 'array';

      return `TYPE ${containerType}<${literalUnion}>`;
    }

    return `TYPE ${wrapTypeModifiers(literalUnion, isRequired, isNullable)}`;
  }

  // Handle geometry types with optional subtype narrowing
  if (schemaType === 'geometry' && field) {
    const subtypes = field.geometrySubtypes;
    let geoType: string;
    if (subtypes?.length) {
      geoType = `geometry<${subtypes.join(' | ')}>`;
    } else {
      geoType = 'geometry<point | line | polygon | multipoint | multiline | multipolygon | collection>';
    }
    if (field.isArray) {
      const containerType = field.isSet ? 'set' : 'array';

      return `TYPE ${containerType}<${geoType}>`;
    }

    return `TYPE ${wrapTypeModifiers(geoType, isRequired, isNullable)}`;
  }

  // Handle primitive array types (String[], Int[], Date[], etc.)
  if (field?.isArray) {
    const surrealType = mapToSurrealType(schemaType);
    const containerType = field.isSet ? 'set' : 'array';

    return `TYPE ${containerType}<${surrealType}>`;
  }

  const surrealType = mapToSurrealType(schemaType);

  return `TYPE ${wrapTypeModifiers(surrealType, isRequired, isNullable)}`;
}

/**
 * Generate the TYPE clause for a typed @id field.
 * Maps recordIdTypes to SurrealQL type strings.
 *
 * Examples:
 *   ['int'] → 'int'
 *   ['string'] → 'string'
 *   ['uuid'] → 'uuid'
 *   ['number'] → 'number'
 *   ['string', 'int'] → 'string | int'
 *   ['MyTuple'] → '[float, float]' (resolved from tupleRegistry)
 *   ['MyObject'] → '{ x: float, y: float }' (resolved from objectRegistry)
 *   ['int', 'MyTuple'] → 'int | [float, float]'
 */
export function generateIdTypeClause(
  recordIdTypes: string[],
  tupleRegistry?: TupleRegistry,
  objectRegistry?: ObjectRegistry,
): string {
  const surrealTypes = recordIdTypes.map((typeName) => {
    switch (typeName) {
      case 'int':
        return 'int';
      case 'number':
        return 'number';
      case 'string':
        return 'string';
      case 'uuid':
        return 'uuid';
    }

    if (tupleRegistry) {
      for (const tupleName in tupleRegistry) {
        if (tupleName === typeName) {
          const tupleMeta = tupleRegistry[tupleName]!;

          return generateTupleSurrealTypeLiteral(
            { tupleName: tupleMeta.name, elements: tupleMeta.elements },
            tupleRegistry,
          );
        }
      }
    }

    if (objectRegistry) {
      for (const objectName in objectRegistry) {
        if (objectName === typeName) {
          const objectMeta = objectRegistry[objectName]!;
          const fieldParts = objectMeta.fields.map((f) => {
            const fieldType = mapToSurrealType(f.type);
            if (!f.isRequired) return `${f.name}: option<${fieldType}>`;
            if (f.isNullable) return `${f.name}: ${fieldType} | null`;

            return `${f.name}: ${fieldType}`;
          });

          return `{ ${fieldParts.join(', ')} }`;
        }
      }
    }

    return typeName;
  });

  return surrealTypes.join(' | ');
}

/**
 * Generate the SurrealDB type literal for a tuple element.
 * Handles primitives, objects, and nested tuples recursively.
 *
 * Uses same nullable/optional semantics as model fields:
 * - optional → option<T>
 * - @nullable → T | null
 * - optional + @nullable → option<T | null>
 */
function generateTupleElementSurrealType(
  element: TupleElementMetadata,
  tupleRegistry: TupleRegistry | undefined,
  state: InlineTypeState | undefined,
  visited: ReadonlySet<string>,
): string {
  let baseType: string;

  if (element.type === 'tuple' && element.tupleInfo && tupleRegistry) {
    // Nested tuple: recurse to build [type1, type2, ...]
    baseType = generateTupleSurrealTypeLiteral(element.tupleInfo, tupleRegistry, state, visited);
  } else if (element.type === 'literal' && element.literalInfo) {
    // `literal` is not a kind name in a type position, so inline the variant union
    baseType = generateLiteralSurrealType(element.literalInfo, tupleRegistry, state);
  } else if (element.type === 'object') {
    // 4.0 refuses `DEFINE FIELD t[N]`, so the database sees an object element only through this literal
    baseType = element.objectInfo
      ? inlineObjectType(element.objectInfo, false, tupleRegistry, state, visited)
      : 'object';
  } else {
    baseType = mapToSurrealType(element.type);
  }

  return wrapTypeModifiers(baseType, !element.isOptional, element.isNullable);
}

/**
 * Generate the SurrealDB typed array literal for a tuple: [float, float]
 * This is used in DEFINE FIELD TYPE clauses.
 */
export function generateTupleSurrealTypeLiteral(
  tupleInfo: TupleFieldMetadata,
  tupleRegistry?: TupleRegistry,
  state?: InlineTypeState,
  visited: ReadonlySet<string> = new Set(),
): string {
  const elementTypes = tupleInfo.elements.map((e) => generateTupleElementSurrealType(e, tupleRegistry, state, visited));

  return `[${elementTypes.join(', ')}]`;
}

/**
 * True when a tuple or literal field's type holds an `object` member, so the field needs `FLEXIBLE` on 4.0.
 * Judged from the same rendering `generateTypeClause` uses, so the clause and the type never disagree.
 */
export function fieldTypeNeedsFlexible(field: FieldMetadata, tupleRegistry?: TupleRegistry): boolean {
  const state: InlineTypeState = { flexible: false };
  if (field.type === 'tuple' && field.tupleInfo) generateTupleSurrealTypeLiteral(field.tupleInfo, tupleRegistry, state);
  else if (field.type === 'literal' && field.literalInfo)
    generateLiteralSurrealType(field.literalInfo, tupleRegistry, state);

  return state.flexible;
}

/**
 * Generate the ASSERT clause for a field, if any.
 * On an array field the assertion runs against the whole array, so it is applied per element instead.
 */
export function generateAssertClause(schemaType: SchemaFieldType, isArray?: boolean): string | undefined {
  const assertion = getTypeAssertion(schemaType);
  if (!assertion) return undefined;
  if (isArray) return `ASSERT $value.all(|$v| ${assertion.replaceAll('$value', '$v')})`;

  return `ASSERT ${assertion}`;
}

const DURATION_LITERAL = /^(\d+(ns|us|µs|ms|[smhdwy]))+$/;

/**
 * Format a `@default` on a sized number field. The kind suffix makes the literal carry its kind (INFO echoes
 * it verbatim) and is what lets a `Uint64` default above the signed 64-bit range parse at all.
 */
function formatSizedDefault(value: unknown, schemaType: SchemaFieldType): string | undefined {
  const kind = SIZED_NUMBER_SURREAL_TYPES[schemaType as keyof typeof SIZED_NUMBER_SURREAL_TYPES];
  if (!kind || (typeof value !== 'number' && typeof value !== 'bigint')) return undefined;

  return `${value}${kind}`;
}

/** Format a value for a DEFAULT clause */
function formatDefaultValue(value: unknown, schemaType?: SchemaFieldType): string {
  const sized = schemaType ? formatSizedDefault(value, schemaType) : undefined;
  if (sized) return sized;

  if (typeof value === 'string') {
    // Duration literal: one or more digit+unit pairs, matched in full because the value is emitted unquoted
    if (DURATION_LITERAL.test(value)) return value;

    return `'${escapeSurqlString(value)}'`;
  }
  if (typeof value === 'boolean') return `${value}`;
  if (typeof value === 'number') return `${value}`;

  return JSON.stringify(value);
}

/** Generate the DEFAULT clause for a field */
export function generateDefaultClause(
  timestampDecorator?: 'now' | 'createdAt' | 'updatedAt',
  defaultValue?: unknown,
  defaultAlwaysValue?: unknown,
  uuidDecorator?: 'uuid' | 'uuid4' | 'uuid7',
  schemaType?: SchemaFieldType,
): string | undefined {
  // @now is COMPUTED, not DEFAULT — handled by generateComputedClause
  // @createdAt uses DEFAULT time::now() — set on creation when field is absent
  if (timestampDecorator === 'createdAt') return 'DEFAULT time::now()';
  // @updatedAt uses DEFAULT ALWAYS time::now() — set on creation and re-set on every update when field is absent
  if (timestampDecorator === 'updatedAt') return 'DEFAULT ALWAYS time::now()';

  if (uuidDecorator === 'uuid') return 'DEFAULT rand::uuid()';
  if (uuidDecorator === 'uuid4') return 'DEFAULT rand::uuid::v4()';
  if (uuidDecorator === 'uuid7') return 'DEFAULT rand::uuid::v7()';

  // @defaultAlways(value) uses DEFAULT ALWAYS — re-set on every write when field is absent
  if (defaultAlwaysValue !== undefined) return `DEFAULT ALWAYS ${formatDefaultValue(defaultAlwaysValue, schemaType)}`;

  if (defaultValue !== undefined) return `DEFAULT ${formatDefaultValue(defaultValue, schemaType)}`;

  return undefined;
}

/** Generate the COMPUTED clause for @now fields */
export function generateComputedClause(timestampDecorator?: 'now' | 'createdAt' | 'updatedAt'): string | undefined {
  if (timestampDecorator === 'now') return 'COMPUTED time::now()';

  return undefined;
}

/**
 * Check if a Record[] field is paired with a Relation via @field decorator
 */
export function hasPairedRelation(field: FieldMetadata, model: ModelMetadata): boolean {
  if (field.type !== 'record' || !field.isArray) return false;

  return model.fields.some((f) => f.type === 'relation' && f.relationInfo?.fieldRef === field.name);
}

/**
 * Generate the VALUE clause for array fields
 *
 * Handles:
 * - Record[] paired with Relation: always $value.distinct() (implicit)
 * - Primitive arrays with @distinct: $value.distinct()
 * - Primitive arrays with @sort: $value.sort::asc() or $value.sort::desc()
 * - Combined @distinct @sort: $value.distinct().sort::asc()
 *
 * Uses conditional to handle NONE values gracefully
 */
export function generateValueClause(field: FieldMetadata, model?: ModelMetadata): string | undefined {
  // @set fields don't need VALUE clause — SurrealDB set type handles dedup/sort natively
  if (field.isSet) return undefined;

  // Record[] paired with Relation - always distinct (existing behavior)
  if (field.type === 'record' && field.isArray && model) {
    if (hasPairedRelation(field, model)) {
      return 'VALUE IF $value THEN $value.distinct() ELSE [] END';
    }
  }

  // Arrays with @distinct and/or @sort decorators
  if (field.isArray && field.type !== 'relation') {
    const operations: string[] = [];

    if (field.isDistinct) {
      operations.push('.distinct()');
    }
    if (field.sortOrder) {
      // array::sort() takes an optional boolean: true = asc (default), false = desc
      operations.push(field.sortOrder === 'desc' ? '.sort(false)' : '.sort(true)');
    }

    if (operations.length) {
      return `VALUE IF $value THEN $value${operations.join('')} ELSE [] END`;
    }
  }

  return undefined;
}
