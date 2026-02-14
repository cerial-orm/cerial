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

/** SurrealQL type string */
export type SurrealQLType =
  | 'string'
  | 'int'
  | 'float'
  | 'bool'
  | 'datetime'
  | 'uuid'
  | 'record'
  | 'array'
  | 'object'
  | 'literal';

/** Mapping from schema types to SurrealQL types */
const TYPE_MAP: Record<SchemaFieldType, SurrealQLType> = {
  string: 'string',
  email: 'string',
  int: 'int',
  float: 'float',
  bool: 'bool',
  date: 'datetime',
  record: 'record',
  relation: 'string', // Virtual type - should not be used directly
  object: 'object', // Embedded object type
  tuple: 'array', // Tuple type - actual type is literal array [type1, type2, ...]
  literal: 'literal', // Literal type - actual type is union of variants
};

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
function variantToSurrealType(variant: ResolvedLiteralVariant, tupleRegistry?: TupleRegistry): string {
  switch (variant.kind) {
    case 'string':
      return `'${variant.value}'`;
    case 'int':
    case 'float':
      return `${variant.value}`;
    case 'bool':
      return `${variant.value}`;
    case 'broadType':
      return broadTypeToSurreal(variant.typeName);
    case 'tupleRef':
      return generateTupleSurrealTypeLiteral(variant.tupleInfo, tupleRegistry);
    case 'objectRef':
      return generateObjectSurrealTypeLiteral(variant.objectInfo, tupleRegistry);
  }
}

/**
 * Generate the inline SurrealQL object type literal for an object variant in a literal.
 * Produces `{ fieldName: type, ... }` with proper optional/nullable modifiers.
 *
 * Only type-level modifiers (optional, @nullable) are expressed — decorators like
 * @default, @createdAt, @readonly cannot be represented in inline type syntax.
 */
export function generateObjectSurrealTypeLiteral(
  objectInfo: ObjectFieldMetadata,
  tupleRegistry?: TupleRegistry,
): string {
  const fieldParts = objectInfo.fields.map((field) => {
    const fieldType = generateObjectFieldSurrealType(field, tupleRegistry);

    return `${field.name}: ${fieldType}`;
  });

  return `{ ${fieldParts.join(', ')} }`;
}

/**
 * Generate the SurrealQL type for a single field inside an inline object literal.
 * Handles primitives, arrays, and literal-typed sub-fields.
 */
function generateObjectFieldSurrealType(field: FieldMetadata, tupleRegistry?: TupleRegistry): string {
  // Array fields: array<baseType>
  if (field.isArray) {
    let baseType: string;
    if (field.type === 'literal' && field.literalInfo) {
      baseType = generateLiteralSurrealType(field.literalInfo, tupleRegistry);
    } else {
      baseType = mapToSurrealType(field.type);
    }

    return `array<${baseType}>`;
  }

  // Literal-typed sub-fields: inline the literal union
  if (field.type === 'literal' && field.literalInfo) {
    const literalUnion = generateLiteralSurrealType(field.literalInfo, tupleRegistry);

    return wrapTypeModifiers(literalUnion, field.isRequired, field.isNullable);
  }

  // Primitive fields
  const baseType = mapToSurrealType(field.type);

  return wrapTypeModifiers(baseType, field.isRequired, field.isNullable);
}

/** Generate the pipe-separated union type string for a literal field */
export function generateLiteralSurrealType(literalInfo: LiteralFieldMetadata, tupleRegistry?: TupleRegistry): string {
  return literalInfo.variants.map((v) => variantToSurrealType(v, tupleRegistry)).join(' | ');
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
  literalRegistry?: LiteralRegistry,
): string {
  const isNullable = field?.isNullable;

  // Handle Record types with target table
  if (schemaType === 'record' && field && model) {
    const targetTable = findRecordTargetTable(field, model);

    if (targetTable) {
      // Array Record type: array<record<table>> VALUE $value.distinct()
      if (field.isArray) {
        return `TYPE array<record<${targetTable}>>`;
      }

      // Single Record type with nullable/optional modifiers
      return `TYPE ${wrapTypeModifiers(`record<${targetTable}>`, isRequired, isNullable)}`;
    }

    // Fallback if no target table found
    if (field.isArray) {
      return 'TYPE array<record>';
    }

    return `TYPE ${wrapTypeModifiers('record', isRequired, isNullable)}`;
  }

  // Handle tuple types — emit typed array literal [type1, type2, ...]
  if (schemaType === 'tuple' && field?.tupleInfo) {
    const tupleLiteral = generateTupleSurrealTypeLiteral(field.tupleInfo, tupleRegistry);

    if (field.isArray) return `TYPE array<${tupleLiteral}>`;

    // Tuples can be @nullable (unlike objects) — SurrealDB supports `[T, T] | null`
    return `TYPE ${wrapTypeModifiers(tupleLiteral, isRequired, isNullable)}`;
  }

  // Handle literal types — emit pipe-separated union of variant types
  if (schemaType === 'literal' && field?.literalInfo) {
    const literalUnion = generateLiteralSurrealType(field.literalInfo, tupleRegistry);

    if (field.isArray) return `TYPE array<${literalUnion}>`;

    return `TYPE ${wrapTypeModifiers(literalUnion, isRequired, isNullable)}`;
  }

  // Handle primitive array types (String[], Int[], Date[], etc.)
  if (field?.isArray) {
    const surrealType = mapToSurrealType(schemaType);
    return `TYPE array<${surrealType}>`;
  }

  // Standard types with nullable/optional modifiers
  // Objects cannot be @nullable (validated), so they'll only get option<object> for optional
  const surrealType = mapToSurrealType(schemaType);

  return `TYPE ${wrapTypeModifiers(surrealType, isRequired, isNullable)}`;
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
function generateTupleElementSurrealType(element: TupleElementMetadata, tupleRegistry?: TupleRegistry): string {
  let baseType: string;

  if (element.type === 'tuple' && element.tupleInfo && tupleRegistry) {
    // Nested tuple: recurse to build [type1, type2, ...]
    baseType = generateTupleSurrealTypeLiteral(element.tupleInfo, tupleRegistry);
  } else if (element.type === 'object') {
    baseType = 'object';
  } else {
    baseType = mapToSurrealType(element.type);
  }

  return wrapTypeModifiers(baseType, !element.isOptional, element.isNullable);
}

/**
 * Generate the SurrealDB typed array literal for a tuple: [float, float]
 * This is used in DEFINE FIELD TYPE clauses.
 */
export function generateTupleSurrealTypeLiteral(tupleInfo: TupleFieldMetadata, tupleRegistry?: TupleRegistry): string {
  const elementTypes = tupleInfo.elements.map((e) => generateTupleElementSurrealType(e, tupleRegistry));

  return `[${elementTypes.join(', ')}]`;
}

/** Generate the ASSERT clause for a field, if any */
export function generateAssertClause(schemaType: SchemaFieldType): string | undefined {
  const assertion = getTypeAssertion(schemaType);
  if (!assertion) return undefined;
  return `ASSERT ${assertion}`;
}

/** Format a value for a DEFAULT clause */
function formatDefaultValue(value: unknown): string {
  if (typeof value === 'string') return `'${value}'`;
  if (typeof value === 'boolean') return `${value}`;
  if (typeof value === 'number') return `${value}`;

  return JSON.stringify(value);
}

/** Generate the DEFAULT clause for a field */
export function generateDefaultClause(
  timestampDecorator?: 'now' | 'createdAt' | 'updatedAt',
  defaultValue?: unknown,
  defaultAlwaysValue?: unknown,
): string | undefined {
  // @now is COMPUTED, not DEFAULT — handled by generateComputedClause
  // @createdAt uses DEFAULT time::now() — set on creation when field is absent
  if (timestampDecorator === 'createdAt') return 'DEFAULT time::now()';
  // @updatedAt uses DEFAULT ALWAYS time::now() — set on creation and re-set on every update when field is absent
  if (timestampDecorator === 'updatedAt') return 'DEFAULT ALWAYS time::now()';

  // @defaultAlways(value) uses DEFAULT ALWAYS — re-set on every write when field is absent
  if (defaultAlwaysValue !== undefined) return `DEFAULT ALWAYS ${formatDefaultValue(defaultAlwaysValue)}`;

  if (defaultValue !== undefined) return `DEFAULT ${formatDefaultValue(defaultValue)}`;

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
