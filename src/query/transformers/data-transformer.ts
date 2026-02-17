/**
 * Data transformer - transforms data for queries
 */

import { Decimal, Duration, Geometry, RecordId, StringRecordId, Uuid } from 'surrealdb';
import type {
  LiteralFieldMetadata,
  ModelMetadata,
  ObjectFieldMetadata,
  SchemaFieldType,
  TupleElementMetadata,
  TupleFieldMetadata,
} from '../../types';
import { CerialBytes } from '../../utils/cerial-bytes';
import { CerialDecimal } from '../../utils/cerial-decimal';
import { CerialDuration } from '../../utils/cerial-duration';
import { CerialGeometry } from '../../utils/cerial-geometry';
import { CerialId, type RecordIdInput } from '../../utils/cerial-id';
import { CerialUuid } from '../../utils/cerial-uuid';
import { isNone, NONE } from '../../utils/none';

/** Transform a value based on field type */
export function transformValue(value: unknown, fieldType: SchemaFieldType): unknown {
  if (value === null || value === undefined) return value;
  // NONE sentinel passes through — handled by update/create builders
  if (isNone(value)) return NONE;

  switch (fieldType) {
    case 'date':
      // Return Date object - SurrealDB SDK handles the conversion
      if (value instanceof Date) return value;
      if (typeof value === 'string') return new Date(value);
      return value;

    case 'int':
      if (typeof value === 'number') return Math.floor(value);
      if (typeof value === 'string') return parseInt(value, 10);
      return value;

    case 'float':
      if (typeof value === 'number') return value;
      if (typeof value === 'string') return parseFloat(value);
      return value;

    case 'number':
      if (typeof value === 'number') return value;
      if (typeof value === 'string') return parseFloat(value);
      return value;

    case 'bool':
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') return value.toLowerCase() === 'true';
      return Boolean(value);

    case 'string':
    case 'email':
      return String(value);

    case 'uuid':
      if (value instanceof CerialUuid) return value.toNative();
      if (value instanceof Uuid) return value;
      if (typeof value === 'string') return new Uuid(value);

      return value;

    case 'duration':
      if (value instanceof CerialDuration) return value.toNative();
      if (value instanceof Duration) return value;
      if (typeof value === 'string') return new Duration(value);

      return value;

    case 'decimal':
      if (value instanceof CerialDecimal) return value.toNative();
      if (value instanceof Decimal) return value;
      if (typeof value === 'number') return new Decimal(value);
      if (typeof value === 'string') return new Decimal(value);

      return value;

    case 'bytes':
      if (value instanceof CerialBytes) return value.toNative();
      if (value instanceof Uint8Array) return value;
      if (typeof value === 'string') return CerialBytes.fromBase64(value).toNative();

      return value;

    case 'geometry':
      if (CerialGeometry.is(value)) return value.toNative();
      if (value instanceof Geometry) return value;
      if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'number') {
        return CerialGeometry.from(value as [number, number]).toNative();
      }
      if (typeof value === 'object' && value !== null && 'type' in value) {
        return CerialGeometry.from(value as Parameters<typeof CerialGeometry.from>[0]).toNative();
      }

      return value;

    case 'any':
    case 'record':
      return value;

    default:
      return value;
  }
}

/**
 * Transform a record id value using SurrealDB's RecordId
 * Accepts RecordIdInput (CerialId | RecordId | StringRecordId | string)
 * @param tableName The table name for record
 * @param value The id value (RecordIdInput)
 */
export function transformRecordId(tableName: string, value: RecordIdInput): RecordId {
  // Use CerialId.parse() to handle all input types with table validation
  const cerialId = CerialId.parse(value, tableName);

  return cerialId.toRecordId();
}

/**
 * Transform or validate a record id value
 * Accepts all RecordIdInput types: CerialId, RecordId, StringRecordId, string
 * Validates that the table matches the expected tableName
 * @param tableName The expected table name
 * @param value The id value (RecordIdInput)
 * @returns RecordId
 */
export function transformOrValidateRecordId(tableName: string, value: RecordIdInput): RecordId {
  // Handle CerialId - use its built-in validation
  if (CerialId.is(value)) {
    if (value.hasTable && value.table !== tableName) {
      throw new Error(`CerialId table "${value.table}" does not match expected table "${tableName}"`);
    }
    // If no table, set it
    if (!value.hasTable) {
      return new RecordId(tableName, value.id);
    }

    return value.toRecordId();
  }

  // Handle RecordId - validate table name matches
  if (value instanceof RecordId) {
    if (value.table.name !== tableName) {
      throw new Error(`RecordId table "${value.table.name}" does not match expected table "${tableName}"`);
    }

    return value;
  }

  // Handle StringRecordId - parse and validate
  if (value instanceof StringRecordId) {
    const cerialId = CerialId.parse(value, tableName);

    return cerialId.toRecordId();
  }

  // Handle string - parse and create RecordId
  if (typeof value === 'string') {
    const cerialId = CerialId.parse(value, tableName);

    return cerialId.toRecordId();
  }

  throw new Error(`Invalid RecordIdInput type: ${typeof value}`);
}

/** Find target table for a Record field by looking at paired Relation field */
function findRecordTargetTable(fieldName: string, model: ModelMetadata): string | undefined {
  // Find a Relation field that references this Record field
  const pairedRelation = model.fields.find((f) => f.type === 'relation' && f.relationInfo?.fieldRef === fieldName);
  return pairedRelation?.relationInfo?.targetTable;
}

/**
 * Convert a value to RecordIdInput for use with transformOrValidateRecordId
 * Handles CerialId, RecordId, StringRecordId, and string
 */
function toRecordIdInput(value: unknown): RecordIdInput {
  if (CerialId.is(value)) return value;
  if (value instanceof RecordId) return value;
  if (value instanceof StringRecordId) return value;

  return String(value);
}

/**
 * Parse a RecordIdInput into a RecordId without table validation.
 * Used for Record fields within objects where no target table is known.
 */
function parseRecordIdInput(value: RecordIdInput): RecordId {
  if (value instanceof RecordId) return value;
  if (CerialId.is(value)) return value.toRecordId();
  if (value instanceof StringRecordId) return CerialId.parse(value).toRecordId();
  if (typeof value === 'string') return CerialId.parse(value).toRecordId();
  throw new Error(`Invalid RecordIdInput type: ${typeof value}`);
}

/**
 * Recursively transform object data based on objectInfo field definitions.
 * Handles Record fields within objects (convert to RecordId), nested objects, and arrays of objects.
 */
function transformObjectData(
  data: Record<string, unknown>,
  objectInfo: ObjectFieldMetadata,
  context: 'create' | 'update' = 'create',
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const field = objectInfo.fields.find((f) => f.name === key);
    if (!field) {
      result[key] = value;
      continue;
    }

    if (value === null || value === undefined) {
      result[key] = value;
      continue;
    }

    // Nested object field
    if (field.type === 'object' && field.objectInfo) {
      if (field.isArray && Array.isArray(value)) {
        result[key] = value.map((item) =>
          typeof item === 'object' && item !== null
            ? transformObjectData(item as Record<string, unknown>, field.objectInfo!, context)
            : item,
        );
      } else if (typeof value === 'object') {
        result[key] = transformObjectData(value as Record<string, unknown>, field.objectInfo, context);
      } else {
        result[key] = value;
      }
      continue;
    }

    // Tuple field in objects — array = full replace, object form depends on context
    if (field.type === 'tuple' && field.tupleInfo) {
      if (field.isArray && Array.isArray(value)) {
        result[key] = value.map((item) => transformTupleData(item, field.tupleInfo!));
      } else if (context === 'update' && !Array.isArray(value) && typeof value === 'object' && value !== null) {
        // Update context: object form = per-element update
        result[key] = transformTupleElementUpdate(value as Record<string, unknown>, field.tupleInfo);
      } else {
        // Create context or array form = full tuple replace/input
        result[key] = transformTupleData(value, field.tupleInfo);
      }
      continue;
    }

    // Record fields in objects — convert RecordIdInput → RecordId
    if (field.type === 'record') {
      if (field.isArray && Array.isArray(value)) {
        result[key] = value.map((element) => {
          if (element === null || element === undefined) return element;

          return parseRecordIdInput(toRecordIdInput(element));
        });
      } else {
        result[key] = parseRecordIdInput(toRecordIdInput(value));
      }
      continue;
    }

    // Array fields
    if (field.isArray && Array.isArray(value)) {
      result[key] = value.map((element) => transformValue(element, field.type));
      continue;
    }

    // Standard field
    result[key] = transformValue(value, field.type);
  }

  return result;
}

/**
 * Determine if a value represents a single tuple input (vs an array of tuple inputs).
 * Object form is always a single tuple. For array form, check if the shape matches
 * the tuple definition (length equals element count and first element is a primitive).
 */
function isSingleTupleInput(value: unknown, tupleInfo: TupleFieldMetadata): boolean {
  // Object form: always a single tuple
  if (!Array.isArray(value)) return typeof value === 'object' && value !== null;
  // Empty array: not a single tuple
  if (!value.length) return false;
  const firstEl = value[0];
  // If first element is an array or non-null object, it's likely an array of tuples
  if (Array.isArray(firstEl) || (typeof firstEl === 'object' && firstEl !== null)) return false;
  // Primitive first element + length matches tuple element count → single tuple
  return value.length === tupleInfo.elements.length;
}

/**
 * Transform tuple data based on tupleInfo element definitions.
 * Handles object elements, nested tuple elements, record elements, and primitive elements.
 * Accepts both array form [a, b] and object form { 0: a, 1: b, name: a } — normalizes to array.
 */
function transformTupleData(data: unknown, tupleInfo: TupleFieldMetadata): unknown[] {
  // Normalize object form to array form
  let arr: unknown[];
  if (Array.isArray(data)) {
    arr = [...data];
  } else if (typeof data === 'object' && data !== null) {
    // Object form: { 0: val, 1: val, name: val }
    // Map named keys to indexes, then fill by index
    const obj = data as Record<string, unknown>;
    arr = new Array(tupleInfo.elements.length);
    for (const element of tupleInfo.elements) {
      // Try named key first, then index key
      if (element.name !== undefined && element.name in obj) {
        arr[element.index] = obj[element.name];
      } else if (String(element.index) in obj) {
        arr[element.index] = obj[String(element.index)];
      }
    }
  } else {
    return data as unknown[];
  }

  // Fill absent @nullable elements with null (SurrealDB rejects NONE for `T | null` fields)
  for (const element of tupleInfo.elements) {
    if (arr[element.index] === undefined && element.isNullable) {
      arr[element.index] = null;
    }
  }

  // Transform each element by type
  for (const element of tupleInfo.elements) {
    const value = arr[element.index];
    if (value === null || value === undefined) continue;

    if (element.type === 'object' && element.objectInfo) {
      if (typeof value === 'object' && !Array.isArray(value)) {
        arr[element.index] = transformObjectData(value as Record<string, unknown>, element.objectInfo);
      }
    } else if (element.type === 'tuple' && element.tupleInfo) {
      arr[element.index] = transformTupleData(value, element.tupleInfo);
    } else if (element.type === 'record') {
      arr[element.index] = parseRecordIdInput(toRecordIdInput(value));
    } else {
      arr[element.index] = transformValue(value, element.type);
    }
  }

  // SurrealDB CBOR bug: CBOR null in the same array as a Geometry tag prevents
  // geometry deserialization. Convert null → undefined only for optional non-nullable
  // elements (option<T> accepts NONE, not NULL). Nullable elements keep null.
  if (arr.some((v) => v instanceof Geometry)) {
    for (const element of tupleInfo.elements) {
      if (arr[element.index] === null && element.isOptional && !element.isNullable) {
        arr[element.index] = undefined;
      }
    }
  }

  return arr;
}

/** Check if a value is a `{ set: {...} }` full-replace wrapper */
function isSetWrapper(value: unknown): value is { set: unknown } {
  return typeof value === 'object' && value !== null && 'set' in value && Object.keys(value).length === 1;
}

/** Resolve a tuple element by name or index key */
function resolveElementByKey(key: string, tupleInfo: TupleFieldMetadata): TupleElementMetadata | undefined {
  const byName = tupleInfo.elements.find((e) => e.name === key);
  if (byName) return byName;
  const index = parseInt(key, 10);
  if (!isNaN(index)) return tupleInfo.elements.find((e) => e.index === index);

  return undefined;
}

/**
 * Transform per-element tuple update data.
 * Only transforms the provided elements — does not normalize to array form.
 * Preserves original keys (named or index) for the update builder to use.
 */
function transformTupleElementUpdate(
  data: Record<string, unknown>,
  tupleInfo: TupleFieldMetadata,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const element = resolveElementByKey(key, tupleInfo);
    if (!element) continue;

    // null, undefined, NONE sentinel — pass through for builder to handle
    if (value === null || value === undefined || isNone(value)) {
      result[key] = value;
      continue;
    }

    // Object element
    if (element.type === 'object' && element.objectInfo) {
      if (isSetWrapper(value)) {
        // { set: ObjectInput } — transform the full object value
        result[key] = { set: transformObjectData(value.set as Record<string, unknown>, element.objectInfo, 'update') };
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        // Partial object merge — transform the provided fields
        result[key] = transformObjectData(value as Record<string, unknown>, element.objectInfo, 'update');
      } else {
        result[key] = value;
      }
      continue;
    }

    // Nested tuple element — array = full replace, object = per-element update (no wrapper)
    if (element.type === 'tuple' && element.tupleInfo) {
      if (Array.isArray(value)) {
        // Full replace (array form)
        result[key] = transformTupleData(value, element.tupleInfo);
      } else if (typeof value === 'object') {
        // Per-element update (object form) — no { update } wrapper at nested levels
        result[key] = transformTupleElementUpdate(value as Record<string, unknown>, element.tupleInfo);
      } else {
        result[key] = value;
      }
      continue;
    }

    // Record element
    if (element.type === 'record') {
      result[key] = parseRecordIdInput(toRecordIdInput(value));
      continue;
    }

    // Primitive element
    result[key] = transformValue(value, element.type);
  }

  return result;
}

/**
 * Transform a literal field value.
 * Primitives (string, number, boolean, Date) pass through unchanged.
 * Arrays are matched against tuple variants and transformed if applicable.
 * Objects are passed through (SurrealDB handles object variants without sub-field constraints).
 */
function transformLiteralValue(value: unknown, literalInfo: LiteralFieldMetadata): unknown {
  if (value === null || value === undefined) return value;

  // Primitive values — pass through unchanged
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value;

  // Array value — might be a tuple variant
  if (Array.isArray(value)) {
    const tupleVariant = literalInfo.variants.find(
      (v) => v.kind === 'tupleRef' && v.tupleInfo.elements.length === value.length,
    );
    if (tupleVariant && tupleVariant.kind === 'tupleRef') {
      return transformTupleData(value, tupleVariant.tupleInfo);
    }

    return value;
  }

  // Object value — might be tuple object-form or an object variant
  if (typeof value === 'object') {
    // Check if this matches a tuple variant's named elements (object form input)
    // Only attempt conversion when no object variant has the same keys (avoid ambiguity)
    const tupleVariants = literalInfo.variants.filter((v) => v.kind === 'tupleRef');
    const objectVariants = literalInfo.variants.filter((v) => v.kind === 'objectRef');
    const keys = Object.keys(value as Record<string, unknown>);

    for (const tv of tupleVariants) {
      if (tv.kind !== 'tupleRef') continue;
      const elementNames = tv.tupleInfo.elements.map((e) => e.name).filter(Boolean);
      const elementIndexes = tv.tupleInfo.elements.map((e) => String(e.index));
      const allValidKeys = [...elementNames, ...elementIndexes];
      const isMatch = keys.length > 0 && keys.every((k) => allValidKeys.includes(k));
      if (isMatch) {
        // Check for ambiguity with object variants
        const isAmbiguous = objectVariants.some((ov) => {
          if (ov.kind !== 'objectRef') return false;
          const objFieldNames = ov.objectInfo.fields.map((f) => f.name);

          return keys.every((k) => objFieldNames.includes(k));
        });
        if (!isAmbiguous) return transformTupleData(value, tv.tupleInfo);
      }
    }

    return value;
  }

  return value;
}

/** Transform data object based on model fields */
export function transformData(
  data: Record<string, unknown>,
  model: ModelMetadata,
  context: 'create' | 'update' = 'create',
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const field = model.fields.find((f) => f.name === key);
    if (field) {
      // Handle id/record fields specially with RecordId
      if (field.isId && value !== undefined && value !== null) {
        result[key] = transformRecordId(model.tableName, toRecordIdInput(value));
      } else if (field.type === 'record') {
        // For record fields, skip undefined but pass null and NONE sentinel through
        // The update builder handles null/NONE → SurrealQL NONE/NULL translation
        if (value === undefined) continue;
        // NONE sentinel → pass through for builder to handle
        if (isNone(value)) {
          result[key] = NONE;
          continue;
        }
        // null → pass through for builder to handle (NONE for non-nullable, NULL for nullable)
        if (value === null) {
          result[key] = null;
          continue;
        }
        // Handle Record fields - transform to RecordId
        const targetTable = findRecordTargetTable(field.name, model);
        if (targetTable) {
          if (field.isArray) {
            if (Array.isArray(value)) {
              // Array of records - direct assignment
              result[key] = value.map((element) => transformOrValidateRecordId(targetTable, toRecordIdInput(element)));
            } else if (typeof value === 'object' && ('push' in value || 'unset' in value)) {
              // Push/unset operations for Record[] - transform values inside
              const ops = value as { push?: unknown; unset?: unknown };
              const transformed: { push?: unknown; unset?: unknown } = {};
              if (ops.push !== undefined) {
                transformed.push = Array.isArray(ops.push)
                  ? ops.push.map((el) => transformOrValidateRecordId(targetTable, toRecordIdInput(el)))
                  : transformOrValidateRecordId(targetTable, toRecordIdInput(ops.push));
              }
              if (ops.unset !== undefined) {
                transformed.unset = Array.isArray(ops.unset)
                  ? ops.unset.map((el) => transformOrValidateRecordId(targetTable, toRecordIdInput(el)))
                  : transformOrValidateRecordId(targetTable, toRecordIdInput(ops.unset));
              }
              result[key] = transformed;
            } else {
              result[key] = value;
            }
          } else {
            // Single record
            result[key] = transformOrValidateRecordId(targetTable, toRecordIdInput(value));
          }
        } else {
          // No paired relation found, keep value as-is
          result[key] = value;
        }
      } else if (field.type === 'object' && field.objectInfo) {
        // Handle object fields - recursively transform
        // Objects cannot be @nullable (validated in schema), so null → skip (NONE)
        if (value === undefined || value === null) continue;
        // NONE sentinel → pass through for builder to handle
        if (isNone(value)) {
          result[key] = NONE;
          continue;
        }
        if (field.isArray && Array.isArray(value)) {
          result[key] = value.map((item) =>
            typeof item === 'object' && item !== null
              ? transformObjectData(item as Record<string, unknown>, field.objectInfo!, context)
              : item,
          );
        } else if (typeof value === 'object') {
          result[key] = transformObjectData(value as Record<string, unknown>, field.objectInfo, context);
        } else {
          result[key] = value;
        }
      } else if (field.type === 'tuple' && field.tupleInfo) {
        // Handle tuple fields - transform and normalize to array
        if (value === undefined) continue;
        // NONE sentinel → pass through for builder to handle
        if (isNone(value)) {
          result[key] = NONE;
          continue;
        }
        // Pass null through — builder converts to NONE (non-nullable) or NULL (@nullable)
        if (value === null) {
          result[key] = null;
          continue;
        }
        if (field.isArray) {
          if (Array.isArray(value)) {
            // Direct array assignment: [[1,2], [3,4]]
            result[key] = value.map((item) => transformTupleData(item, field.tupleInfo!));
          } else if (typeof value === 'object' && value !== null) {
            // Push/set operations: { push: [...], set: [...] }
            const ops = value as Record<string, unknown>;
            if ('set' in ops && ops.set !== undefined) {
              // set = full array replacement → unwrap to direct array assignment
              result[key] = Array.isArray(ops.set)
                ? ops.set.map((item) => transformTupleData(item, field.tupleInfo!))
                : ops.set;
            } else if ('push' in ops && ops.push !== undefined) {
              const transformed: Record<string, unknown> = {};
              if (isSingleTupleInput(ops.push, field.tupleInfo!)) {
                // Single tuple: wrap in array so SurrealDB += appends one tuple element
                transformed.push = [transformTupleData(ops.push, field.tupleInfo!)];
              } else if (Array.isArray(ops.push)) {
                // Array of tuples
                transformed.push = ops.push.map((item) => transformTupleData(item, field.tupleInfo!));
              } else {
                transformed.push = ops.push;
              }
              result[key] = transformed;
            } else {
              result[key] = value;
            }
          } else {
            result[key] = value;
          }
        } else if (context === 'update' && !Array.isArray(value) && typeof value === 'object' && value !== null) {
          // Update context: object form = per-element update
          result[key] = transformTupleElementUpdate(value as Record<string, unknown>, field.tupleInfo);
        } else {
          // Create context or array form: full tuple replace/input
          result[key] = transformTupleData(value, field.tupleInfo);
        }
      } else if (field.type === 'literal' && field.literalInfo) {
        // Handle literal fields - pass primitive values through,
        // transform tuple/object variants if needed
        if (value === undefined) continue;
        if (isNone(value)) {
          result[key] = NONE;
          continue;
        }
        if (value === null) {
          result[key] = null;
          continue;
        }
        if (field.isArray) {
          if (Array.isArray(value)) {
            result[key] = value.map((item) => transformLiteralValue(item, field.literalInfo!));
          } else if (typeof value === 'object' && value !== null) {
            // Push/unset operations - pass through as-is (handled by update builder)
            result[key] = value;
          } else {
            result[key] = value;
          }
        } else {
          result[key] = transformLiteralValue(value, field.literalInfo!);
        }
      } else if (field.type === 'uuid' && field.isArray) {
        if (Array.isArray(value)) {
          result[key] = value.map((element) => transformValue(element, 'uuid'));
        } else if (typeof value === 'object' && value !== null) {
          const ops = value as Record<string, unknown>;
          const transformed: Record<string, unknown> = {};
          if ('push' in ops && ops.push !== undefined) {
            transformed.push = Array.isArray(ops.push)
              ? ops.push.map((el) => transformValue(el, 'uuid'))
              : transformValue(ops.push, 'uuid');
          }
          if ('set' in ops && ops.set !== undefined) {
            transformed.set = Array.isArray(ops.set) ? ops.set.map((el) => transformValue(el, 'uuid')) : ops.set;
          }
          if ('unset' in ops && ops.unset !== undefined) {
            transformed.unset = Array.isArray(ops.unset)
              ? ops.unset.map((el) => transformValue(el, 'uuid'))
              : transformValue(ops.unset, 'uuid');
          }
          result[key] = Object.keys(transformed).length ? transformed : value;
        } else {
          result[key] = value;
        }
      } else if (field.type === 'duration' && field.isArray) {
        if (Array.isArray(value)) {
          result[key] = value.map((element) => transformValue(element, 'duration'));
        } else if (typeof value === 'object' && value !== null) {
          const ops = value as Record<string, unknown>;
          const transformed: Record<string, unknown> = {};
          if ('push' in ops && ops.push !== undefined) {
            transformed.push = Array.isArray(ops.push)
              ? ops.push.map((el) => transformValue(el, 'duration'))
              : transformValue(ops.push, 'duration');
          }
          if ('set' in ops && ops.set !== undefined) {
            transformed.set = Array.isArray(ops.set) ? ops.set.map((el) => transformValue(el, 'duration')) : ops.set;
          }
          if ('unset' in ops && ops.unset !== undefined) {
            transformed.unset = Array.isArray(ops.unset)
              ? ops.unset.map((el) => transformValue(el, 'duration'))
              : transformValue(ops.unset, 'duration');
          }
          result[key] = Object.keys(transformed).length ? transformed : value;
        } else {
          result[key] = value;
        }
      } else if (field.type === 'bytes' && field.isArray) {
        if (Array.isArray(value)) {
          result[key] = value.map((element) => transformValue(element, 'bytes'));
        } else if (typeof value === 'object' && value !== null) {
          const ops = value as Record<string, unknown>;
          const transformed: Record<string, unknown> = {};
          if ('push' in ops && ops.push !== undefined) {
            transformed.push = Array.isArray(ops.push)
              ? ops.push.map((el) => transformValue(el, 'bytes'))
              : transformValue(ops.push, 'bytes');
          }
          if ('set' in ops && ops.set !== undefined) {
            transformed.set = Array.isArray(ops.set) ? ops.set.map((el) => transformValue(el, 'bytes')) : ops.set;
          }
          if ('unset' in ops && ops.unset !== undefined) {
            transformed.unset = Array.isArray(ops.unset)
              ? ops.unset.map((el) => transformValue(el, 'bytes'))
              : transformValue(ops.unset, 'bytes');
          }
          result[key] = Object.keys(transformed).length ? transformed : value;
        } else {
          result[key] = value;
        }
      } else if (field.type === 'decimal' && field.isArray) {
        if (Array.isArray(value)) {
          result[key] = value.map((element) => transformValue(element, 'decimal'));
        } else if (typeof value === 'object' && value !== null) {
          const ops = value as Record<string, unknown>;
          const transformed: Record<string, unknown> = {};
          if ('push' in ops && ops.push !== undefined) {
            transformed.push = Array.isArray(ops.push)
              ? ops.push.map((el) => transformValue(el, 'decimal'))
              : transformValue(ops.push, 'decimal');
          }
          if ('set' in ops && ops.set !== undefined) {
            transformed.set = Array.isArray(ops.set) ? ops.set.map((el) => transformValue(el, 'decimal')) : ops.set;
          }
          if ('unset' in ops && ops.unset !== undefined) {
            transformed.unset = Array.isArray(ops.unset)
              ? ops.unset.map((el) => transformValue(el, 'decimal'))
              : transformValue(ops.unset, 'decimal');
          }
          result[key] = Object.keys(transformed).length ? transformed : value;
        } else {
          result[key] = value;
        }
      } else if (field.isArray) {
        // Handle array fields - direct assignment or push/unset operations
        if (Array.isArray(value)) {
          result[key] = value.map((element) => transformValue(element, field.type));
        } else if (typeof value === 'object' && value !== null) {
          const ops = value as Record<string, unknown>;
          if ('push' in ops && ops.push !== undefined) {
            const transformed: Record<string, unknown> = {};
            transformed.push = Array.isArray(ops.push)
              ? ops.push.map((el) => transformValue(el, field.type))
              : transformValue(ops.push, field.type);
            if ('unset' in ops) transformed.unset = ops.unset;
            result[key] = transformed;
          } else {
            result[key] = value;
          }
        } else {
          result[key] = value;
        }
      } else {
        result[key] = transformValue(value, field.type);
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Apply defaults to data for create operation:
 * - Empty arrays for array fields that are undefined
 * - Filter out relation fields (they're virtual)
 * - Apply @default(null) for fields with that decorator
 * - Handle NONE vs null semantics
 *
 * NONE vs null in SurrealDB:
 * - NONE: field doesn't exist (omit from data)
 * - null: field exists with null value
 *
 * Schema semantics (with @nullable):
 * - `field String?` (no @default): undefined → NONE (omit field)
 * - `field String? @default(null)`: undefined → null (store null, requires @nullable)
 * - `field Record? @nullable`: undefined → null (so they can be queried for null)
 * - `field Record?` (non-nullable): undefined → NONE (omit field)
 */
export function applyFieldDefaults(data: Record<string, unknown>, model: ModelMetadata): Record<string, unknown> {
  const result: Record<string, unknown> = { ...data };

  for (const field of model.fields) {
    // Skip relation fields - they're virtual and shouldn't be sent to database
    if (field.type === 'relation') {
      delete result[field.name];
      continue;
    }

    // Strip @now (COMPUTED) fields - they are not stored, computed at query time
    if (field.timestampDecorator === 'now') {
      delete result[field.name];
      continue;
    }

    // For optional @nullable record fields, default undefined to null (so they can be queried for null)
    // For optional non-nullable record fields, leave as undefined (NONE)
    // Skip @id fields - they should remain undefined for auto-generation
    if (field.type === 'record' && !field.isRequired && !field.isId && result[field.name] === undefined) {
      if (field.isNullable) {
        result[field.name] = null;
      }
      continue;
    }

    // Apply @default(null) - if field has this and value is undefined, set to null
    if (field.defaultValue === null && result[field.name] === undefined) {
      result[field.name] = null;
      continue;
    }

    // Apply empty array default for array fields that are undefined
    if (field.isArray && result[field.name] === undefined) {
      result[field.name] = [];
    }
  }

  return result;
}

/**
 * @deprecated Use applyFieldDefaults instead. This alias exists for backwards compatibility.
 */
export const applyNowDefaults = applyFieldDefaults;

/** Filter data to only include model fields */
export function filterModelFields(data: Record<string, unknown>, model: ModelMetadata): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const fieldNames = new Set(model.fields.map((f) => f.name));

  for (const [key, value] of Object.entries(data)) {
    if (fieldNames.has(key)) {
      result[key] = value;
    }
  }

  return result;
}
