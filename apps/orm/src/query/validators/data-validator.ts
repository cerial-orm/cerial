/**
 * Data validator - validates data for create/update operations
 */

import type {
  FieldMetadata,
  LiteralFieldMetadata,
  ModelMetadata,
  ResolvedLiteralVariant,
  SchemaFieldType,
  TupleFieldMetadata,
} from '../../types';
import { isRecordIdInput } from '../../utils/cerial-id';
import { isNone } from '../../utils/none';
import { escapeControl } from '../../utils/safe-text';
import { isObject } from '../../utils/type-utils';
import { isValidEmail, validateFieldType, validateTypedRecordId } from '../../utils/validation-utils';
import { convertUnsetToNoneValues } from '../builders/update-builder';
import { isSingleTupleInput } from '../transformers/data-transformer';
import { sizedNumberError } from './sized-number-validator';

/** Validation error */
export interface DataValidationError {
  field: string;
  message: string;
  kind?: 'unknownField';
}

/** Validation result */
export interface DataValidationResult {
  valid: boolean;
  errors: DataValidationError[];
}

const BROAD_TYPE_FIELD_TYPES: Record<string, SchemaFieldType> = {
  String: 'string',
  Int: 'int',
  Float: 'float',
  Bool: 'bool',
  Date: 'date',
};

/** Names no model: a variant's errors only decide whether it matches, and are never shown. */
const VARIANT_MODEL: ModelMetadata = { name: '', tableName: '', fields: [] };

function matchesVariant(value: unknown, variant: ResolvedLiteralVariant): boolean {
  switch (variant.kind) {
    case 'broadType':
      return validateFieldType(value, BROAD_TYPE_FIELD_TYPES[variant.typeName] ?? 'any');
    // The database enforces these inline, so the members are checked here too: a wrong member type or
    // an undeclared key would otherwise reach it. Tuples accept array or object form on input.
    case 'tupleRef':
      return (
        validateFieldType(value, 'tuple') &&
        !validateSubValue(value, { type: 'tuple', tupleInfo: variant.tupleInfo }, VARIANT_MODEL, '', false, true).length
      );
    case 'objectRef':
      return (
        validateFieldType(value, 'object') &&
        !validateSubValue(value, { type: 'object', objectInfo: variant.objectInfo }, VARIANT_MODEL, '', false, true)
          .length
      );
    default:
      return value === variant.value;
  }
}

function describeVariant(variant: ResolvedLiteralVariant): string {
  switch (variant.kind) {
    case 'broadType':
      return variant.typeName;
    case 'tupleRef':
      return variant.tupleName;
    case 'objectRef':
      return variant.objectName;
    case 'string':
      return `'${variant.value}'`;
    default:
      return String(variant.value);
  }
}

function literalError(label: string, value: unknown, literalInfo: LiteralFieldMetadata): string | null {
  if (literalInfo.variants.some((v) => matchesVariant(value, v))) return null;

  const received = typeof value === 'string' ? `'${value}'` : String(value);

  return `${label} must be one of: ${literalInfo.variants.map(describeVariant).join(', ')} (received ${received})`;
}

/** What a value is checked against. Model fields and tuple elements both reduce to this. */
export interface FieldValueRules {
  type: SchemaFieldType;
  isRequired: boolean;
  isArray?: boolean;
  isNullable?: boolean;
  recordIdTypes?: string[];
  literalInfo?: LiteralFieldMetadata;
}

/** Validate a single field value */
export function validateFieldValue(
  fieldName: string,
  value: unknown,
  { type: fieldType, isRequired, isArray, isNullable, recordIdTypes, literalInfo }: FieldValueRules,
): DataValidationError | null {
  // NONE sentinel is always valid for optional fields (clear the field)
  if (isNone(value)) {
    if (isRequired) {
      return { field: fieldName, message: `${fieldName} is required and cannot be set to NONE` };
    }

    return null;
  }

  // Check null — only allowed on @nullable fields or Any type (CerialAny includes null)
  if (value === null) {
    if (fieldType === 'any') return null;

    if (isRequired && !isNullable) {
      return { field: fieldName, message: `${fieldName} is required` };
    }
    if (!isNullable) {
      return {
        field: fieldName,
        message: `${fieldName} is not nullable — use NONE to unset, or add @nullable to the schema`,
      };
    }

    return null;
  }

  // Check undefined (field omitted) — valid for optional or defaulted fields
  if (value === undefined) {
    if (isRequired) {
      return { field: fieldName, message: `${fieldName} is required` };
    }

    return null;
  }

  // Handle array fields
  if (isArray) {
    if (!Array.isArray(value)) {
      return { field: fieldName, message: `${fieldName} must be an array` };
    }
    // Validate each element in the array
    for (let i = 0; i < value.length; i++) {
      const element = value[i];
      const sizedMessage = sizedNumberError(fieldType, `${fieldName}[${i}]`, element);
      if (sizedMessage) return { field: fieldName, message: sizedMessage };
      if (!validateFieldType(element, fieldType)) {
        return { field: fieldName, message: `${fieldName}[${i}] must be of type ${fieldType}` };
      }
      const literalMessage = literalInfo && literalError(`${fieldName}[${i}]`, element, literalInfo);
      if (literalMessage) return { field: fieldName, message: literalMessage };
    }
    return null;
  }

  const sizedMessage = sizedNumberError(fieldType, fieldName, value);
  if (sizedMessage) return { field: fieldName, message: sizedMessage };

  // Check type for non-array fields
  if (!validateFieldType(value, fieldType)) {
    return { field: fieldName, message: `${fieldName} must be of type ${fieldType}` };
  }

  const literalMessage = literalInfo && literalError(fieldName, value, literalInfo);
  if (literalMessage) return { field: fieldName, message: literalMessage };

  // For record fields with recordIdTypes, validate against expected ID types
  if (fieldType === 'record' && recordIdTypes?.length) {
    if (!validateTypedRecordId(value, recordIdTypes)) {
      return {
        field: fieldName,
        message: `${fieldName} must be a valid ${recordIdTypes.join(' | ')} record ID`,
      };
    }
  }

  // Special validation for email
  if (fieldType === 'email' && typeof value === 'string') {
    if (!isValidEmail(value)) {
      return { field: fieldName, message: `${fieldName} must be a valid email` };
    }
  }

  return null;
}

/** Reject keys that are not fields of the model. Known-but-excluded fields (computed, readonly) are not unknown. */
export function validateKnownKeys(data: Record<string, unknown>, model: ModelMetadata): DataValidationError[] {
  const known = new Set(model.fields.map((f) => f.name));
  return Object.keys(data)
    .filter((key) => !known.has(key))
    .map((key) => unknownSubKey(key, model));
}

const NESTED_WRITE_KEYS = ['create', 'connect', 'disconnect', 'set'];

/** The operations a relation field takes: `set` replaces an array, so only an array relation has it. */
function allowedNestedOps(field: ModelMetadata['fields'][number]): string[] {
  return field.isArray ? NESTED_WRITE_KEYS : NESTED_WRITE_KEYS.filter((key) => key !== 'set');
}

/**
 * A relation is virtual, so its value is only ever a nested operation. Anything else (a plain record id, a
 * plain object, `{ update }`, `{}`, an unknown key beside a valid one) has no emitted form and used to be
 * dropped without a word or fail in the database with a raw error. Returns the refusal, or null.
 */
export function validateRelationValue(
  field: ModelMetadata['fields'][number],
  value: unknown,
  model: ModelMetadata,
  path: string = field.name,
): DataValidationError | null {
  if (value === undefined) return null;
  const allowed = allowedNestedOps(field);
  const keys = isObject(value) ? Object.keys(value) : [];
  if (keys.length && keys.every((key) => allowed.includes(key))) return null;

  return {
    field: path,
    message: `Relation '${path}' on model ${model.name} takes a nested operation with only these keys: ${allowed.join(', ')}. Got ${
      isObject(value) ? `keys {${keys.join(', ') || 'none'}}` : 'a plain value'
    }, which cannot be written`,
  };
}

/**
 * Refuse every relation value inside the data of a nested create. The nested builders emit one level and the
 * generated nested-create type has no relations, so any value here (a nested operation or not) was dropped
 * without a word. `path` names the nested create the data belongs to, for example `posts[0]`.
 */
export function validateNoNestedWrites(
  data: Record<string, unknown>,
  model: ModelMetadata,
  path: string,
): DataValidationError[] {
  const errors: DataValidationError[] = [];
  for (const field of model.fields) {
    if (field.type !== 'relation' || data[field.name] === undefined) continue;
    errors.push({
      field: `${path}.${field.name}`,
      message: `Nested writes inside a nested create are not supported: '${path}.${field.name}' holds a relation value. Create or connect that record in a separate call`,
    });
  }

  return errors;
}

/**
 * Validate one field's input value the way create does: the id check for an id field, otherwise the type
 * rules of the field and, for an object or tuple, every nested element. A where operand goes through the same
 * function, so a filter refuses exactly what create refuses. `path` names the field in the refusal.
 */
export function validateFieldInput(
  field: FieldMetadata,
  value: unknown,
  model: ModelMetadata,
  path: string = field.name,
): DataValidationError[] {
  if (field.isId) {
    if (value === undefined || value === null) return [];
    if (field.recordIdTypes?.length) {
      if (validateTypedRecordId(value, field.recordIdTypes)) return [];

      return [{ field: path, message: `${path} must be a valid ${field.recordIdTypes.join(' | ')} record ID` }];
    }

    return isRecordIdInput(value) ? [] : [{ field: path, message: `${path} must be a valid record ID` }];
  }

  const error = validateFieldValue(path, value, field);
  if (error) return [error];

  // The top-level call above already covered literal fields. A create is stored whole, so an undeclared
  // key in a strict object is refused here rather than by the database, which would echo it raw.
  if (field.type === 'object' || field.type === 'tuple')
    return validateSubValue(value, field, model, path, false, true);

  return [];
}

/** Validate data for create operation */
export function validateCreateData(
  data: Record<string, unknown>,
  model: ModelMetadata,
  nestedOps?: Map<string, unknown>,
): DataValidationResult {
  const errors: DataValidationError[] = validateKnownKeys(data, model);

  // Build set of Record fields that will be satisfied by nested operations
  const fieldsFromNestedOps = new Set<string>();
  if (nestedOps) {
    for (const relationName of nestedOps.keys()) {
      // Find the relation field and its fieldRef (the Record field it populates)
      const relationField = model.fields.find((f) => f.name === relationName && f.type === 'relation');
      if (relationField?.relationInfo?.fieldRef) {
        fieldsFromNestedOps.add(relationField.relationInfo.fieldRef);
      }
    }
  }

  for (const field of model.fields) {
    const value = data[field.name];

    // Skip relation fields - they're virtual and don't exist in database
    if (field.type === 'relation') continue;

    if (field.isId) {
      errors.push(...validateFieldInput(field, value, model));
      continue;
    }

    // Skip @now fields entirely (COMPUTED — not stored, never in user input)
    if (field.timestampDecorator === 'now') continue;

    // Skip @createdAt/@updatedAt fields when undefined (handled by database via DEFAULT/DEFAULT ALWAYS)
    if ((field.timestampDecorator === 'createdAt' || field.timestampDecorator === 'updatedAt') && value === undefined)
      continue;

    // Skip @uuid/@uuid4/@uuid7 fields when undefined (handled by database via DEFAULT)
    if (field.uuidDecorator && value === undefined) continue;

    // Skip fields with default value (if not provided)
    if (field.defaultValue !== undefined && value === undefined) continue;

    // Skip @defaultAlways fields when undefined (handled by database via DEFAULT ALWAYS)
    if (field.defaultAlwaysValue !== undefined && value === undefined) continue;

    // Skip array fields when undefined - they default to empty array
    if (field.isArray && (value === undefined || value === null)) continue;

    // Skip Record fields that will be populated by nested operations
    if (field.type === 'record' && fieldsFromNestedOps.has(field.name)) continue;

    errors.push(...validateFieldInput(field, value, model));
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate unset object for update operations.
 * Ensures all fields in unset are valid model fields that can be unset.
 */
export function validateUnset(unset: Record<string, unknown>, model: ModelMetadata): DataValidationResult {
  const errors: DataValidationError[] = [];

  for (const [fieldName, value] of Object.entries(unset)) {
    if (value === undefined) continue;

    const field = model.fields.find((f) => f.name === fieldName);
    if (!field) {
      errors.push(unknownSubKey(fieldName, model));
      continue;
    }

    // Cannot unset readonly, relation, id, or @now fields
    if (field.isReadonly) {
      errors.push({ field: fieldName, message: `Cannot unset readonly field '${fieldName}'` });
      continue;
    }
    if (field.type === 'relation') {
      errors.push({ field: fieldName, message: `Cannot unset relation field '${fieldName}' — use disconnect instead` });
      continue;
    }
    if (field.isId) {
      errors.push({ field: fieldName, message: `Cannot unset id field '${fieldName}'` });
      continue;
    }
    if (field.timestampDecorator === 'now') {
      errors.push({ field: fieldName, message: `Cannot unset computed field '${fieldName}'` });
      continue;
    }

    // true = unset entire field — must be optional
    if (value === true) {
      if (field.isRequired) {
        errors.push({
          field: fieldName,
          message: `Cannot unset required field '${fieldName}' — only optional fields can be unset`,
        });
      }
      continue;
    }

    // Object value = sub-field unset. The builder merges it into data as NONE values, so it is walked
    // the same way: an undeclared sub-key on a strict object would otherwise emit a NONE write to a
    // path that does not exist and report success.
    if (typeof value === 'object' && value !== null) {
      if (field.isArray && field.type === 'object') {
        errors.push({
          field: fieldName,
          message: `unset on '${fieldName}' takes true only; unsetting a sub-field is not supported on an array of objects`,
        });
        continue;
      }
      if (field.type === 'object' || field.type === 'tuple')
        errors.push(
          ...validateSubValue(
            convertUnsetToNoneValues(value as Record<string, unknown>),
            field,
            model,
            fieldName,
            true,
          ),
        );
      continue;
    }

    errors.push({
      field: fieldName,
      message: `Invalid unset value for '${fieldName}' — expected true or sub-field object`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate that data and unset don't have leaf-level conflicts.
 * Data takes priority — conflicting fields in unset are errors.
 */
export function validateDataUnsetOverlap(
  data: Record<string, unknown>,
  unset: Record<string, unknown>,
  _model: ModelMetadata,
): DataValidationResult {
  const errors: DataValidationError[] = [];

  for (const [fieldName, unsetValue] of Object.entries(unset)) {
    if (unsetValue === undefined) continue;
    if (!(fieldName in data) || data[fieldName] === undefined) continue;

    // Both data and unset touch this field
    if (unsetValue === true) {
      // Leaf conflict: data sets a value, unset tries to clear it
      errors.push({
        field: fieldName,
        message: `Field '${fieldName}' appears in both data and unset — cannot set and unset the same field`,
      });
      continue;
    }

    // Sub-field unset — only a conflict if data also has an object at this key
    // Deep overlap checking is best-effort; the type system handles most cases
    const dataValue = data[fieldName];
    if (
      typeof unsetValue === 'object' &&
      typeof dataValue === 'object' &&
      dataValue !== null &&
      !Array.isArray(dataValue)
    ) {
      // Both are objects — check for leaf-level overlap recursively
      const subErrors = validateDataUnsetOverlapDeep(
        dataValue as Record<string, unknown>,
        unsetValue as Record<string, unknown>,
        fieldName,
      );
      errors.push(...subErrors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/** Recursively check data/unset overlap at sub-field level */
function validateDataUnsetOverlapDeep(
  data: Record<string, unknown>,
  unset: Record<string, unknown>,
  parentPath: string,
): DataValidationError[] {
  const errors: DataValidationError[] = [];

  for (const [key, unsetValue] of Object.entries(unset)) {
    if (unsetValue === undefined) continue;
    if (!(key in data) || data[key] === undefined) continue;

    const path = `${parentPath}.${key}`;

    if (unsetValue === true) {
      errors.push({
        field: path,
        message: `Field '${path}' appears in both data and unset — cannot set and unset the same field`,
      });
      continue;
    }

    const dataValue = data[key];
    if (
      typeof unsetValue === 'object' &&
      typeof dataValue === 'object' &&
      dataValue !== null &&
      !Array.isArray(dataValue)
    ) {
      errors.push(
        ...validateDataUnsetOverlapDeep(
          dataValue as Record<string, unknown>,
          unsetValue as Record<string, unknown>,
          path,
        ),
      );
    }
  }

  return errors;
}

function unknownSubKey(path: string, model: ModelMetadata): DataValidationError {
  return {
    field: path,
    kind: 'unknownField',
    message: `Unknown field '${escapeControl(path)}' on model ${model.name} — check the field name against the schema`,
  };
}

/**
 * Check the values an array operation ({ push }, { set }, { unset }) carries on a primitive array
 * against the element type, exactly as a create checks an element. The index in the path is the
 * position within the operation's own values, not within the stored array.
 */
function arrayOperationErrors(
  operation: Record<string, unknown>,
  field: WalkField,
  path: string,
): DataValidationError[] {
  const errors: DataValidationError[] = [];

  for (const key of ['push', 'set', 'unset']) {
    const input = operation[key];
    if (input === undefined) continue;
    const items = Array.isArray(input) ? input : [input];
    items.forEach((item, i) => {
      if (item === undefined || isNone(item)) return;
      const label = `${path}[${i}]`;
      const message = sizedNumberError(field.type, label, item);
      if (message) return void errors.push({ field: path, message });
      if (!validateFieldType(item, field.type))
        return void errors.push({ field: path, message: `${label} must be of type ${field.type}` });
      const literalMessage = field.literalInfo && literalError(label, item, field.literalInfo);
      if (literalMessage) errors.push({ field: path, message: literalMessage });
    });
  }

  return errors;
}

/** Mirrors the builder's `{ set: ... }` full-replace wrapper, whose contents are bound whole. */
function isSetWrapper(value: Record<string, unknown>): boolean {
  return 'set' in value && Object.keys(value).length === 1;
}

/** The slice of a model field or tuple element that the nested walk reads. */
type WalkField = Pick<
  FieldMetadata,
  'type' | 'isArray' | 'isFlexible' | 'isNullable' | 'literalInfo' | 'objectInfo' | 'tupleInfo'
>;

/**
 * Check one whole object or tuple value the way a create checks it: its type, then its shape, declared
 * keys and element types. A where operand that compares a field to a whole value is held to the same rules.
 */
export function validateWholeValue(
  field: WalkField & Pick<FieldMetadata, 'recordIdTypes'>,
  value: unknown,
  model: ModelMetadata,
  path: string,
): DataValidationError[] {
  const error = validateFieldValue(path, value, { ...field, isRequired: false });
  if (error) return [error];

  return validateSubValue(value, field, model, path, false, true);
}

/** Field lists of the objects enclosing the value being checked, by object name */
type ObjectDefs = ReadonlyMap<string, FieldMetadata[]>;
const NO_DEFS: ObjectDefs = new Map();

/**
 * Validate a value nested inside an object or tuple, to any depth.
 * `inline` is true inside a tuple element or a literal variant, whose members the database checks
 * against an inline type: an undeclared key in a strict object is refused there rather than dropped.
 * A value the builder binds whole (`{ set }` contents, array element, push item) is always checked as
 * inline: the database types a self-referencing field FLEXIBLE, so it would store an undeclared key
 * at the first level that only this check can refuse.
 * `partial` is true while the builder merges the value key by key (an update's object or object-form
 * tuple), where an undeclared key would be dropped. A value it binds whole (array element, `{ set }`
 * contents, push item) is not partial. Enum fields carry `type: 'literal'`, so one branch covers both.
 */
function validateSubValue(
  value: unknown,
  field: WalkField,
  model: ModelMetadata,
  path: string,
  partial: boolean,
  inline = false,
  defs: ObjectDefs = NO_DEFS,
): DataValidationError[] {
  if (value === undefined || isNone(value)) return [];

  if (field.type === 'literal' && field.literalInfo) {
    // An object on an array field is an operation ({ push }, { set }), not a value to check
    if (field.isArray && isObject(value)) return arrayOperationErrors(value, field, path);
    const error = validateFieldValue(path, value, { ...field, isRequired: false });

    return error ? [error] : [];
  }

  if (field.type !== 'object' && field.type !== 'tuple') {
    if (field.isArray && isObject(value)) return arrayOperationErrors(value, field, path);
    // A relation is virtual
    if (field.type === 'relation') return [];
    // The database refuses a member of the wrong type; a whole float in an int member is an int in JS
    const error = validateFieldValue(path, value, { ...field, isRequired: false });

    return error ? [error] : [];
  }

  if (field.isArray) {
    const element = { ...field, isArray: false };
    if (Array.isArray(value))
      return value.flatMap((item, i) => validateSubValue(item, element, model, `${path}[${i}]`, false, true, defs));
    if (!isObject(value)) return typeErrors(path, value, field);

    // { push } and { set } carry whole elements. updateWhere and unset are typed but the builder never
    // applies them, so a call that reports success would change nothing: refuse them by name.
    const errors: DataValidationError[] = [];
    for (const key of ['updateWhere', 'unset']) {
      if (value[key] === undefined) continue;
      errors.push({
        field: path,
        message: `${path}.${key} is not supported on an array of ${field.type}s; replace the whole array with the array itself or { set }, or append with { push }`,
      });
    }
    // Any other key (pop, remove, delete, ...) is not an array operation here and the builder would drop it
    for (const key of Object.keys(value)) {
      if (['set', 'push', 'updateWhere', 'unset'].includes(key) || value[key] === undefined) continue;
      errors.push({
        field: path,
        message: `${path}.${key} is not supported on an array of ${field.type}s; replace the whole array with the array itself or { set }, or append with { push }`,
      });
    }
    if (value.set !== undefined && Array.isArray(value.set))
      errors.push(...validateSubValue(value.set, field, model, path, false, true, defs));
    if (value.push !== undefined) {
      const items =
        Array.isArray(value.push) && !(field.tupleInfo && isSingleTupleInput(value.push, field.tupleInfo))
          ? value.push
          : [value.push];
      items.forEach((item, i) => {
        errors.push(...validateSubValue(item, element, model, `${path}.push[${i}]`, false, true, defs));
      });
    }

    return errors;
  }

  if (isObject(value) && isSetWrapper(value)) return validateSubValue(value.set, field, model, path, false, true, defs);

  // A nested object or tuple holds an object or a tuple, however deep it sits: the database checks nothing
  // below a self-referencing object, and a tuple element's type is only as strict as this check
  const shape = typeErrors(path, value, field);
  if (shape.length) return shape;

  if (field.type === 'tuple') {
    if (!field.tupleInfo) return [];
    if (Array.isArray(value)) return validateTupleArray(value, field.tupleInfo, model, path, defs);

    return isObject(value) ? validateTupleData(value, field.tupleInfo, model, path, partial, inline, defs) : [];
  }

  if (!field.objectInfo || !isObject(value)) return [];

  const { objectName, fields } = field.objectInfo;

  return validateObjectData(value, objectName, fields, field.isFlexible, model, path, partial, inline, defs);
}

/** The refusal when a value is not the kind of thing the field holds (an object, a tuple, an array of them) */
function typeErrors(path: string, value: unknown, field: WalkField): DataValidationError[] {
  const error = validateFieldValue(path, value, { ...field, isRequired: false });

  return error ? [error] : [];
}

/**
 * Validate the sub-keys of an object. Merged key by key (`partial`), the builder skips an undeclared
 * sub-key on a strict object, so without the key check the write is dropped and reported as a success.
 * @flexible objects accept any undeclared sub-key; that is read per field, never per object type.
 */
function validateObjectData(
  data: Record<string, unknown>,
  objectName: string,
  declared: FieldMetadata[],
  isFlexible: boolean | undefined,
  model: ModelMetadata,
  path: string,
  partial: boolean,
  inline: boolean,
  outer: ObjectDefs,
): DataValidationError[] {
  const errors: DataValidationError[] = [];
  // A self-referencing object lists its fields one level deep and an empty list below; the copy that
  // encloses it, seen on the way down, holds the real list
  const fields = declared.length ? declared : (outer.get(objectName) ?? declared);
  const defs = new Map(outer).set(objectName, fields);

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;

    const subField = fields.find((f) => f.name === key);
    const subPath = `${path}.${key}`;

    if (!subField) {
      if ((partial || inline) && !isFlexible) errors.push(unknownSubKey(subPath, model));
      continue;
    }

    // The database types a self-referencing object FLEXIBLE, so it checks nothing below the first level:
    // a reference back to an enclosing object is checked here even in a value the builder binds whole, and
    // it is flexible exactly when the field it hangs under is
    const cyclic = !!subField.objectInfo && defs.has(subField.objectInfo.objectName);
    const next = cyclic && isFlexible ? { ...subField, isFlexible } : subField;
    errors.push(...validateSubValue(value, next, model, subPath, partial, inline || cyclic, defs));
  }

  return errors;
}

/** Validate the elements of a tuple in array form, which is a whole value. */
function validateTupleArray(
  data: unknown[],
  tupleInfo: TupleFieldMetadata,
  model: ModelMetadata,
  path: string,
  defs: ObjectDefs,
): DataValidationError[] {
  // The database refuses an extra position, and the builder would drop it from a write
  if (data.length > tupleInfo.elements.length)
    return [
      {
        field: path,
        message: `${path} holds ${data.length} elements and its tuple has ${tupleInfo.elements.length}`,
      },
    ];

  return tupleInfo.elements.flatMap((element) =>
    validateSubValue(data[element.index], element, model, `${path}[${element.index}]`, false, true, defs),
  );
}

/** Validate the element keys (by name or index) of a tuple in object form. */
function validateTupleData(
  data: Record<string, unknown>,
  tupleInfo: TupleFieldMetadata,
  model: ModelMetadata,
  path: string,
  partial: boolean,
  inline: boolean,
  defs: ObjectDefs,
): DataValidationError[] {
  const errors: DataValidationError[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;

    const element = tupleInfo.elements.find((e) => e.name === key || String(e.index) === key);
    const subPath = `${path}.${key}`;

    if (!element) {
      if (partial || inline) errors.push(unknownSubKey(subPath, model));
      continue;
    }

    // Tuple elements are never flexible
    errors.push(...validateSubValue(value, element, model, subPath, partial, true, defs));
  }

  return errors;
}

/** Validate data for update operation */
export function validateUpdateData(data: Record<string, unknown>, model: ModelMetadata): DataValidationResult {
  const errors: DataValidationError[] = validateKnownKeys(data, model);

  for (const [fieldName, value] of Object.entries(data)) {
    if (value === undefined) continue;

    const field = model.fields.find((f) => f.name === fieldName);
    if (!field) continue;

    // @readonly fields cannot be updated — reject immediately
    if (field.isReadonly) {
      errors.push({ field: fieldName, message: `Cannot update readonly field '${fieldName}'` });
      continue;
    }

    // Skip relation fields - they're virtual
    if (field.type === 'relation') continue;

    // For array fields with object values (push/unset operations), skip type validation
    // as the operation format is handled separately
    if (field.isArray && typeof value === 'object' && !Array.isArray(value) && value !== null) {
      errors.push(...validateSubValue(value, field, model, fieldName, true));
      continue;
    }

    // Tuple per-element update (non-array object on single tuple): element keys are checked here
    if (
      field.type === 'tuple' &&
      !field.isArray &&
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      errors.push(...validateSubValue(value, field, model, fieldName, true));
      continue;
    }

    // NONE sentinel is always valid in updates (clears the field)
    if (isNone(value)) continue;

    // Partial object merge sub-keys, and whole object or tuple values, are checked here
    const subErrors =
      field.type === 'object' || field.type === 'tuple' ? validateSubValue(value, field, model, fieldName, true) : [];
    errors.push(...subErrors);

    // For updates, don't require fields - just validate types. The walk above already named a wrong shape.
    const error = subErrors.some((e) => e.field === fieldName)
      ? null
      : validateFieldValue(fieldName, value, { ...field, isRequired: false });
    if (error) {
      errors.push(error);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
