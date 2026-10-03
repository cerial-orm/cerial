/**
 * WHERE clause validator
 */

import { RecordId, StringRecordId } from 'surrealdb';
import type {
  CompositeIndex,
  FieldMetadata,
  ModelMetadata,
  ModelRegistry,
  TupleFieldMetadata,
  WhereClause,
} from '../../types';
import { CerialBytes } from '../../utils/cerial-bytes';
import { CerialDecimal } from '../../utils/cerial-decimal';
import { CerialDuration } from '../../utils/cerial-duration';
import { CerialGeometry } from '../../utils/cerial-geometry';
import { CerialId } from '../../utils/cerial-id';
import { CerialUuid } from '../../utils/cerial-uuid';
import { isObject } from '../../utils/type-utils';
import { validateTypedRecordId } from '../../utils/validation-utils';
import { isOperatorObject, resolveTupleElementKey } from '../filters/condition-builder';
import { isRegisteredOperator } from '../filters/registry';

function isDirectValue(value: unknown): boolean {
  return (
    CerialId.is(value) ||
    value instanceof RecordId ||
    value instanceof StringRecordId ||
    CerialUuid.is(value) ||
    CerialDuration.is(value) ||
    CerialDecimal.is(value) ||
    CerialBytes.is(value) ||
    value instanceof Uint8Array ||
    CerialGeometry.is(value)
  );
}

/** One problem found by the where validator */
export interface CerialValidationIssue {
  path: string;
  message: string;
  kind?: 'unknownField';
}

/** Validation result */
export interface WhereValidationResult {
  valid: boolean;
  errors: CerialValidationIssue[];
}

/** Find the @@unique directive a where key names, if any */
function findCompositeDirective(key: string, model: ModelMetadata): CompositeIndex | undefined {
  return model.compositeDirectives?.find((d) => d.kind === 'unique' && d.name === key);
}

/**
 * Check a composite key value against its @@unique directive. The query builder flattens the value to
 * the directive's own fields and drops any that are missing or undefined, so an incomplete value would
 * otherwise widen the filter, all the way to an unconditional DELETE or UPDATE.
 */
function validateCompositeValue(
  directive: CompositeIndex,
  value: unknown,
  model: ModelMetadata,
  path: string,
): CerialValidationIssue[] {
  const required = `@@unique(${directive.name}, [${directive.fields.join(', ')}])`;
  const fail = (problem: string): CerialValidationIssue[] => [
    {
      path,
      message: `Invalid composite key '${directive.name}' on model ${model.name} — it must name every field of ${required} as a plain value; ${problem}`,
    },
  ];

  if (!isObject(value) || isDirectValue(value))
    return fail(`got ${Array.isArray(value) ? 'an array' : value === null ? 'null' : typeof value}`);

  const seen = new Set<string>();
  const problems: string[] = [];

  const walk = (node: Record<string, unknown>, prefix: string): void => {
    for (const [key, child] of Object.entries(node)) {
      const keyPath = prefix ? `${prefix}.${key}` : key;

      // The builder walks nested objects, so a key that is itself dotted would never be read
      if (key.includes('.')) {
        if (child !== undefined) problems.push(`'${keyPath}' must be written as nested objects, not a dotted key`);
      } else if (directive.fields.includes(keyPath)) {
        if (child === undefined) continue;
        if (isOperatorObject(child) || (isObject(child) && !isDirectValue(child)) || Array.isArray(child))
          problems.push(`'${keyPath}' must be a plain value, not a filter or nested object`);
        else seen.add(keyPath);
      } else if (directive.fields.some((f) => f.startsWith(`${keyPath}.`))) {
        if (isObject(child) && !isDirectValue(child)) walk(child, keyPath);
        else if (child !== undefined) problems.push(`'${keyPath}' must be an object holding ${required} fields`);
      } else if (child !== undefined) {
        problems.push(`'${keyPath}' is not part of the directive`);
      }
    }
  };
  walk(value, '');

  const missing = directive.fields.filter((f) => !seen.has(f));
  if (missing.length) problems.unshift(`missing ${missing.map((f) => `'${f}'`).join(', ')}`);

  return problems.length ? fail(problems.join('; ')) : [];
}

const QUANTIFIERS = ['some', 'every', 'none'];
const LOGICAL_KEYS = ['AND', 'OR', 'NOT'];

function unknownSubField(path: string, fieldPath: string, model: ModelMetadata): CerialValidationIssue {
  return {
    path,
    kind: 'unknownField',
    message: `Unknown field '${fieldPath}' on model ${model.name} — check the field name against the schema`,
  };
}

/** Validate the keys of an object field's filter. @flexible objects accept any undeclared sub-key. */
function validateObjectFilter(
  filter: Record<string, unknown>,
  fields: FieldMetadata[],
  isFlexible: boolean | undefined,
  isArray: boolean | undefined,
  model: ModelMetadata,
  path: string,
  fieldPath: string,
): CerialValidationIssue[] {
  const errors: CerialValidationIssue[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue;

    if (isArray) {
      if (QUANTIFIERS.includes(key)) {
        if (isObject(value))
          errors.push(...validateObjectFilter(value, fields, isFlexible, false, model, `${path}.${key}`, fieldPath));
      } else {
        errors.push(unknownSubField(`${path}.${key}`, `${fieldPath}.${key}`, model));
      }
      continue;
    }

    if (LOGICAL_KEYS.includes(key)) {
      for (const item of key === 'NOT' ? [value] : Array.isArray(value) ? value : []) {
        if (isObject(item))
          errors.push(...validateObjectFilter(item, fields, isFlexible, false, model, `${path}.${key}`, fieldPath));
      }
      continue;
    }

    const subField = fields.find((f) => f.name === key);
    const subPath = `${path}.${key}`;
    const subFieldPath = `${fieldPath}.${key}`;

    if (!subField) {
      if (!isFlexible) errors.push(unknownSubField(subPath, subFieldPath, model));
      continue;
    }
    if (!isObject(value) || isDirectValue(value) || isOperatorObject(value)) continue;

    if (subField.type === 'object' && subField.objectInfo)
      errors.push(
        ...validateObjectFilter(
          value,
          subField.objectInfo.fields,
          subField.isFlexible,
          subField.isArray,
          model,
          subPath,
          subFieldPath,
        ),
      );
  }

  return errors;
}

/** Validate the element keys (by name or index) of a tuple field's filter. */
function validateTupleFilter(
  filter: Record<string, unknown>,
  tupleInfo: TupleFieldMetadata,
  isArray: boolean | undefined,
  model: ModelMetadata,
  path: string,
  fieldPath: string,
): CerialValidationIssue[] {
  const errors: CerialValidationIssue[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue;

    if (isArray) {
      if (QUANTIFIERS.includes(key)) {
        if (isObject(value))
          errors.push(...validateTupleFilter(value, tupleInfo, false, model, `${path}.${key}`, fieldPath));
      } else {
        errors.push(unknownSubField(`${path}.${key}`, `${fieldPath}.${key}`, model));
      }
      continue;
    }

    const subPath = `${path}.${key}`;
    const subFieldPath = `${fieldPath}.${key}`;
    const element = resolveTupleElementKey(key, tupleInfo)?.syntheticField;

    if (!element) {
      errors.push(unknownSubField(subPath, subFieldPath, model));
      continue;
    }
    if (!isObject(value) || isDirectValue(value) || isOperatorObject(value)) continue;

    if (element.type === 'object' && element.objectInfo)
      errors.push(
        ...validateObjectFilter(value, element.objectInfo.fields, false, false, model, subPath, subFieldPath),
      );
    else if (element.type === 'tuple' && element.tupleInfo)
      errors.push(...validateTupleFilter(value, element.tupleInfo, false, model, subPath, subFieldPath));
  }

  return errors;
}

/**
 * Validate the filter on a relation against the target model's fields. An array relation takes
 * some/every/none, each holding a target where; a single relation takes the target where directly.
 * The nested builders skip a key they cannot resolve, so an unchecked typo would widen the result.
 */
function validateRelationFilter(
  filter: Record<string, unknown>,
  field: FieldMetadata,
  model: ModelMetadata,
  registry: ModelRegistry,
  path: string,
  fieldPath: string,
): CerialValidationIssue[] {
  const target = field.relationInfo ? registry[field.relationInfo.targetModel] : undefined;
  if (!target) return [];

  if (!field.isArray) return validateTargetWhere(filter, target, registry, path, fieldPath);

  const errors: CerialValidationIssue[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue;

    if (!QUANTIFIERS.includes(key)) {
      errors.push({
        path: `${path}.${key}`,
        message: `Unknown key '${key}' in the filter on relation '${fieldPath}' of model ${model.name} — use some, every or none`,
      });
    } else if (isObject(value)) {
      errors.push(...validateTargetWhere(value, target, registry, `${path}.${key}`, `${fieldPath}.${key}`));
    }
  }

  return errors;
}

/** Validate a where written against a relation's target model, naming that model in every message. */
function validateTargetWhere(
  where: Record<string, unknown>,
  target: ModelMetadata,
  registry: ModelRegistry,
  path: string,
  fieldPath: string,
): CerialValidationIssue[] {
  const errors: CerialValidationIssue[] = [];

  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;

    if (LOGICAL_KEYS.includes(key)) {
      for (const item of key === 'NOT' ? [value] : Array.isArray(value) ? value : []) {
        if (isObject(item)) errors.push(...validateTargetWhere(item, target, registry, `${path}.${key}`, fieldPath));
      }
    } else if (!target.fields.some((f) => f.name === key)) {
      errors.push(unknownSubField(`${path}.${key}`, `${fieldPath}.${key}`, target));
    } else {
      errors.push(...validateFieldFilter(key, value, target, `${path}.${key}`, registry));
    }
  }

  return errors;
}

/** Validate a single field filter. The registry lets a relation filter be checked against its target model. */
export function validateFieldFilter(
  fieldName: string,
  filter: unknown,
  model: ModelMetadata,
  path: string,
  registry?: ModelRegistry,
): CerialValidationIssue[] {
  const errors: CerialValidationIssue[] = [];

  // Composite unique keys are expanded later by the query builder, which cannot tell a missing part from
  // an absent one, so the value is checked here against the directive
  const directive = findCompositeDirective(fieldName, model);
  if (directive) return validateCompositeValue(directive, filter, model, path);

  // Check if field exists in model
  const field = model.fields.find((f) => f.name === fieldName);
  if (!field) {
    errors.push(unknownSubField(path, fieldName, model));
    return errors;
  }

  // For record fields with typed IDs, validate direct values against expected types
  if (field.type === 'record' && field.recordIdTypes?.length) {
    if (!isObject(filter)) {
      if (!validateTypedRecordId(filter, field.recordIdTypes)) {
        errors.push({
          path,
          message: `${fieldName} must be a valid ${field.recordIdTypes.join(' | ')} record ID`,
        });
      }

      return errors;
    }

    if (!isDirectValue(filter) && !isOperatorObject(filter)) {
      const hasObjectOrTupleIdType = field.recordIdTypes!.some(
        (t) => !['int', 'float', 'number', 'string', 'uuid'].includes(t),
      );
      if (hasObjectOrTupleIdType) return errors;
    }
  }

  // If filter is an object, validate operators
  // But first check if it's a RecordIdInput type (CerialId, RecordId, StringRecordId)
  // which should be treated as direct values, not operator objects
  if (isObject(filter) && !isDirectValue(filter)) {
    // For relation fields, the filter object contains nested field conditions, not operators
    // e.g., profile: { bio: { contains: 'x' } } - bio is a field, not an operator
    if (field.type === 'relation') {
      // Without a registry the target model is unknown, so the nested keys cannot be checked
      if (!registry) return errors;

      return validateRelationFilter(filter, field, model, registry, path, fieldName);
    }

    // For object fields, the filter object contains sub-field conditions, not operators
    // e.g., address: { city: 'NYC' } - city is a sub-field, not an operator
    // For array object fields: locations: { some: { lat: { gt: 0 } } }
    if (field.type === 'object' && field.objectInfo) {
      return validateObjectFilter(
        filter,
        field.objectInfo.fields,
        field.isFlexible,
        field.isArray,
        model,
        path,
        fieldName,
      );
    }

    // For tuple fields, the filter object contains element conditions by name/index
    // e.g., location: { lat: { gt: 1.0 } } or location: { 0: { gt: 1.0 } }
    if (field.type === 'tuple' && field.tupleInfo) {
      return validateTupleFilter(filter, field.tupleInfo, field.isArray, model, path, fieldName);
    }

    for (const [op, _value] of Object.entries(filter)) {
      if (!isRegisteredOperator(op)) {
        errors.push({ path: `${path}.${op}`, message: `Unknown operator: ${op}` });
      }
    }
  }

  return errors;
}

/** Validate a where clause recursively */
export function validateWhereClause(
  where: WhereClause,
  model: ModelMetadata,
  path: string = 'where',
  registry?: ModelRegistry,
): CerialValidationIssue[] {
  const errors: CerialValidationIssue[] = [];

  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;

    // Handle logical operators
    if (key === 'AND' || key === 'OR') {
      if (!Array.isArray(value)) {
        errors.push({ path: `${path}.${key}`, message: `${key} must be an array` });
        continue;
      }

      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (isObject(item)) {
          errors.push(...validateWhereClause(item as WhereClause, model, `${path}.${key}[${i}]`, registry));
        }
      }
      continue;
    }

    if (key === 'NOT') {
      if (!isObject(value)) {
        errors.push({ path: `${path}.NOT`, message: 'NOT must be an object' });
        continue;
      }
      errors.push(...validateWhereClause(value as WhereClause, model, `${path}.NOT`, registry));
      continue;
    }

    // Validate field filter
    errors.push(...validateFieldFilter(key, value, model, `${path}.${key}`, registry));
  }

  return errors;
}

/** Validate a where clause and return result */
export function validateWhere(
  where: WhereClause | undefined,
  model: ModelMetadata,
  registry?: ModelRegistry,
): WhereValidationResult {
  if (!where) {
    return { valid: true, errors: [] };
  }

  const errors = validateWhereClause(where, model, 'where', registry);
  return {
    valid: errors.length === 0,
    errors,
  };
}
