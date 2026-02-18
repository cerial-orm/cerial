/**
 * Centralized helpers for generating typed Record ID types.
 *
 * Used by interface-generator, derived-generator, and objects/interface-generator
 * to emit `CerialId<T>`, `RecordIdInput<T>`, and raw ID input types.
 */

import type { FieldMetadata, ObjectRegistry, TupleRegistry } from '../../types';
import { schemaTypeToTsType } from '../../utils/type-utils';

/**
 * Map a single recordIdType name to its TypeScript type string.
 * Handles primitives, uuid, and registry lookups for tuples/objects.
 */
function singleRecordIdTypeToTs(
  typeName: string,
  tupleRegistry?: TupleRegistry,
  objectRegistry?: ObjectRegistry,
): string {
  // Primitive mappings
  const primitiveMap: Record<string, string> = {
    int: 'number',
    number: 'number',
    float: 'number',
    string: 'string',
    uuid: 'string',
  };

  if (primitiveMap[typeName]) return primitiveMap[typeName]!;

  // Tuple reference — generate inline array type like [number, number]
  if (tupleRegistry?.[typeName]) {
    const tuple = tupleRegistry[typeName]!;
    const elements = tuple.elements.map((el) => {
      if (el.type === 'object' && el.objectInfo && objectRegistry) {
        return generateObjectShape(el.objectInfo.objectName, objectRegistry);
      }
      if (el.type === 'tuple' && el.tupleInfo && tupleRegistry) {
        return generateTupleShape(el.tupleInfo.tupleName, tupleRegistry, objectRegistry);
      }

      return schemaTypeToTsType(el.type);
    });

    return `[${elements.join(', ')}]`;
  }

  // Object reference — generate inline shape like { service: string; ts: number }
  if (objectRegistry?.[typeName]) {
    return generateObjectShape(typeName, objectRegistry);
  }

  // Fallback: return as-is (shouldn't happen with valid schemas)
  return typeName;
}

/** Generate an inline object shape string like `{ service: string; ts: number }` */
function generateObjectShape(objectName: string, objectRegistry: ObjectRegistry): string {
  const obj = objectRegistry[objectName];
  if (!obj) return objectName;

  const fields = obj.fields.map((f) => {
    const optional = f.isRequired ? '' : '?';
    const tsType = schemaTypeToTsType(f.type);

    return `${f.name}${optional}: ${tsType}`;
  });

  return `{ ${fields.join('; ')} }`;
}

/** Generate an inline tuple shape string like `[number, number]` */
function generateTupleShape(tupleName: string, tupleRegistry: TupleRegistry, objectRegistry?: ObjectRegistry): string {
  const tuple = tupleRegistry[tupleName];
  if (!tuple) return 'unknown[]';

  const elements = tuple.elements.map((el) => {
    if (el.type === 'object' && el.objectInfo && objectRegistry) {
      return generateObjectShape(el.objectInfo.objectName, objectRegistry);
    }
    if (el.type === 'tuple' && el.tupleInfo && tupleRegistry) {
      return generateTupleShape(el.tupleInfo.tupleName, tupleRegistry, objectRegistry);
    }

    return schemaTypeToTsType(el.type);
  });

  return `[${elements.join(', ')}]`;
}

/**
 * Convert recordIdTypes array to a TypeScript type string.
 * Single type → just the type. Multiple → union with ` | `.
 */
function recordIdTypesToTsType(
  recordIdTypes: string[],
  tupleRegistry?: TupleRegistry,
  objectRegistry?: ObjectRegistry,
): string {
  const tsTypes = recordIdTypes.map((t) => singleRecordIdTypeToTs(t, tupleRegistry, objectRegistry));

  return tsTypes.join(' | ');
}

/**
 * Get the TypeScript output type string for a Record field.
 * Returns CerialId<T> with appropriate generic parameter.
 */
export function getRecordOutputType(
  field: FieldMetadata,
  tupleRegistry?: TupleRegistry,
  objectRegistry?: ObjectRegistry,
): string {
  if (!field.recordIdTypes?.length) return 'CerialId<string>';

  const tsType = recordIdTypesToTsType(field.recordIdTypes, tupleRegistry, objectRegistry);

  return `CerialId<${tsType}>`;
}

/**
 * Get the TypeScript input type string for a Record field.
 * Returns RecordIdInput<T> with appropriate generic parameter.
 */
export function getRecordInputType(
  field: FieldMetadata,
  tupleRegistry?: TupleRegistry,
  objectRegistry?: ObjectRegistry,
): string {
  if (!field.recordIdTypes?.length) return 'RecordIdInput<string>';

  const tsType = recordIdTypesToTsType(field.recordIdTypes, tupleRegistry, objectRegistry);

  return `RecordIdInput<${tsType}>`;
}

/**
 * Get the raw TypeScript value type for @id create input.
 * For @id fields, create input uses raw values (no CerialId/RecordId wrappers).
 */
export function getIdCreateInputType(
  field: FieldMetadata,
  tupleRegistry?: TupleRegistry,
  objectRegistry?: ObjectRegistry,
): string {
  if (!field.recordIdTypes?.length) return 'string';

  return recordIdTypesToTsType(field.recordIdTypes, tupleRegistry, objectRegistry);
}

/**
 * Whether an @id field with given recordIdTypes should be optional in create input.
 * Rules: string in union → optional, uuid alone → optional, otherwise required.
 */
export function isIdOptionalInCreate(recordIdTypes?: string[]): boolean {
  if (!recordIdTypes?.length) return true; // plain Record @id → optional (auto-gen string)
  if (recordIdTypes.includes('string')) return true; // string in union → optional
  if (recordIdTypes.length === 1 && recordIdTypes[0] === 'uuid') return true; // uuid alone → optional (Cerial injects rand::uuid::v7())

  return false; // int, number, tuple, object → required
}
