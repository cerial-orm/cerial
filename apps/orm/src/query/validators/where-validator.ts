/**
 * WHERE clause validator
 */

import type {
  CompositeIndex,
  FieldMetadata,
  ModelMetadata,
  ModelRegistry,
  ObjectFieldMetadata,
  TupleFieldMetadata,
  WhereClause,
} from '../../types';
import { CerialValidationError } from '../../errors';
import { escapeControl } from '../../utils/safe-text';
import { isObject } from '../../utils/type-utils';
import { validateTypedRecordId } from '../../utils/validation-utils';
import { isOperatorObject, resolveTupleElementKey } from '../filters/condition-builder';
import { splitArrayRelationFilter } from '../filters/nested-condition-builder';
import { isRegisteredOperator } from '../filters/registry';
import { isSqlFragment } from '../compile/sql-fragment';
import { refuseFragmentInValue } from './fragment-value';
import { enclosedFields, NO_DEFS, type ObjectDefs } from './data-validator';
import { operandIssues } from './where-operand-validator';

/** A class instance (an SDK value, a Cerial wrapper, a Date, bytes) is a value; only a plain object holds keys */
function isDirectValue(value: unknown): boolean {
  if (!isObject(value)) return false;
  const proto = Object.getPrototypeOf(value);

  return proto !== Object.prototype && proto !== null;
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

/**
 * The bodies under an AND, OR or NOT key, each with its path. A shape the compilers would skip (AND or OR that is not
 * an array of objects, NOT that is not an object) is reported, so it cannot widen or invert a filter at any depth.
 */
function logicalBodies(
  key: string,
  value: unknown,
  path: string,
  errors: CerialValidationIssue[],
): Array<[Record<string, unknown>, string]> {
  if (key === 'NOT') {
    if (isObject(value)) return [[value, `${path}.NOT`]];
    errors.push({ path: `${path}.NOT`, message: 'NOT must be an object' });

    return [];
  }

  if (!Array.isArray(value)) {
    errors.push({ path: `${path}.${key}`, message: `${key} must be an array` });

    return [];
  }

  const bodies: Array<[Record<string, unknown>, string]> = [];
  value.forEach((item, i) => {
    if (isObject(item)) bodies.push([item, `${path}.${key}[${i}]`]);
    else errors.push({ path: `${path}.${key}[${i}]`, message: `${key} items must be objects` });
  });

  return bodies;
}

/** A some, every or none body must be a filter object; the compilers skip anything else. */
function quantifierBodyIssue(quantifier: string, value: unknown, path: string): CerialValidationIssue[] {
  if (isObject(value)) return [];
  const got = Array.isArray(value) ? 'an array' : value === null ? 'null' : typeof value;

  return [{ path, message: `The ${quantifier} filter must be an object, got ${got}` }];
}

/** Every key of an operator object must be a registered operator; the compiler drops the others. */
function operatorKeyIssues(filter: Record<string, unknown>, path: string): CerialValidationIssue[] {
  return Object.keys(filter)
    .filter((op) => !isRegisteredOperator(op))
    .map((op) => ({ path: `${path}.${op}`, message: `Unknown operator: ${escapeControl(op)}` }));
}

function unknownSubField(path: string, fieldPath: string, model: ModelMetadata): CerialValidationIssue {
  return {
    path,
    kind: 'unknownField',
    message: `Unknown field '${escapeControl(fieldPath)}' on model ${model.name} — check the field name against the schema`,
  };
}

/** Validate the keys of an object field's filter. @flexible objects accept any undeclared sub-key. */
function validateObjectFilter(
  filter: Record<string, unknown>,
  objectInfo: ObjectFieldMetadata,
  isFlexible: boolean | undefined,
  isArray: boolean | undefined,
  model: ModelMetadata,
  path: string,
  fieldPath: string,
  outer: ObjectDefs,
): CerialValidationIssue[] {
  const errors: CerialValidationIssue[] = [];
  const { fields, defs } = enclosedFields(objectInfo.objectName, objectInfo.fields, outer);

  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue;

    if (isArray) {
      if (QUANTIFIERS.includes(key)) {
        errors.push(...quantifierBodyIssue(key, value, `${path}.${key}`));
        if (isObject(value))
          errors.push(
            ...validateObjectFilter(value, objectInfo, isFlexible, false, model, `${path}.${key}`, fieldPath, outer),
          );
      } else {
        errors.push(unknownSubField(`${path}.${key}`, `${fieldPath}.${key}`, model));
      }
      continue;
    }

    if (LOGICAL_KEYS.includes(key)) {
      for (const [item, itemPath] of logicalBodies(key, value, path, errors))
        errors.push(...validateObjectFilter(item, objectInfo, isFlexible, false, model, itemPath, fieldPath, outer));
      continue;
    }

    const subField = fields.find((f) => f.name === key);
    const subPath = `${path}.${key}`;
    const subFieldPath = `${fieldPath}.${key}`;

    if (!subField) {
      if (!isFlexible) errors.push(unknownSubField(subPath, subFieldPath, model));
      // An undeclared key holds a value unless the object names an operator, and then every key must be one
      else if (isObject(value) && !isDirectValue(value) && isOperatorObject(value))
        errors.push(...operatorKeyIssues(value, subPath));
      continue;
    }
    errors.push(...operandIssues(subField, value, subPath, subFieldPath, model));
    if (!isObject(value) || isDirectValue(value)) continue;

    if (subField.type === 'object' && subField.objectInfo)
      errors.push(
        ...validateObjectFilter(
          value,
          subField.objectInfo,
          subField.isFlexible,
          subField.isArray,
          model,
          subPath,
          subFieldPath,
          defs,
        ),
      );
    else if (subField.type === 'tuple' && subField.tupleInfo)
      errors.push(
        ...validateTupleFilter(value, subField.tupleInfo, subField.isArray, model, subPath, subFieldPath, defs),
      );
    else errors.push(...operatorKeyIssues(value, subPath));
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
  defs: ObjectDefs,
): CerialValidationIssue[] {
  const errors: CerialValidationIssue[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue;

    if (isArray) {
      if (QUANTIFIERS.includes(key)) {
        errors.push(...quantifierBodyIssue(key, value, `${path}.${key}`));
        if (isObject(value))
          errors.push(...validateTupleFilter(value, tupleInfo, false, model, `${path}.${key}`, fieldPath, defs));
      } else {
        errors.push(unknownSubField(`${path}.${key}`, `${fieldPath}.${key}`, model));
      }
      continue;
    }

    const subPath = `${path}.${key}`;
    const subFieldPath = `${fieldPath}.${key}`;
    const resolved = resolveTupleElementKey(key, tupleInfo);
    const element = resolved?.syntheticField;

    if (!element) {
      errors.push(unknownSubField(subPath, subFieldPath, model));
      continue;
    }
    // The synthetic element drops what only the tuple's own element carries
    const declared = tupleInfo.elements.find((e) => e.index === resolved.index)!;
    errors.push(
      ...operandIssues(
        { ...element, isNullable: declared.isNullable, literalInfo: declared.literalInfo },
        value,
        subPath,
        subFieldPath,
        model,
      ),
    );
    if (!isObject(value) || isDirectValue(value)) continue;

    if (element.type === 'object' && element.objectInfo)
      errors.push(...validateObjectFilter(value, element.objectInfo, false, false, model, subPath, subFieldPath, defs));
    else if (element.type === 'tuple' && element.tupleInfo)
      errors.push(...validateTupleFilter(value, element.tupleInfo, false, model, subPath, subFieldPath, defs));
    else errors.push(...operatorKeyIssues(value, subPath));
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
  // Plain target-field keys (shorthand for `some`) and isEmpty are compiled only on the reverse path
  const isReverse = !!field.relationInfo?.isReverse;
  const { hasExplicit, plain } = splitArrayRelationFilter(filter);
  const plainKeys = Object.keys(plain);

  if (isReverse && hasExplicit && plainKeys.length) {
    errors.push({
      path,
      message: `The filter on relation '${fieldPath}' of model ${model.name} mixes the field keys ${plainKeys.map((k) => `'${k}'`).join(', ')} with some, every, none or isEmpty — move the fields into a 'some' body`,
    });
  }

  if (isReverse && plainKeys.length) errors.push(...validateTargetWhere(plain, target, registry, path, fieldPath));

  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue;

    if (key === 'isEmpty' && isReverse) {
      if (typeof value !== 'boolean')
        errors.push({
          path: `${path}.isEmpty`,
          message: `isEmpty on relation '${fieldPath}' of model ${model.name} must be a boolean`,
        });
    } else if (QUANTIFIERS.includes(key)) {
      errors.push(...quantifierBodyIssue(key, value, `${path}.${key}`));
      if (isObject(value))
        errors.push(...validateTargetWhere(value, target, registry, `${path}.${key}`, `${fieldPath}.${key}`));
    } else if (!isReverse || LOGICAL_KEYS.includes(key)) {
      errors.push({
        path: `${path}.${key}`,
        message: `Unknown key '${escapeControl(key)}' in the filter on relation '${escapeControl(fieldPath)}' of model ${model.name} — use ${isReverse ? 'some, every, none or isEmpty' : 'some, every or none'}`,
      });
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
    // A fragment's bare names would resolve against the wrong row here, branded or not
    if (key === '$raw') {
      errors.push({
        path: `${path}.$raw`,
        message: `${path}.$raw is not allowed in the filter on relation '${fieldPath}'; put the fragment in the where of the model that owns the field`,
      });
      continue;
    }

    if (value === undefined) continue;

    if (LOGICAL_KEYS.includes(key)) {
      for (const [item, itemPath] of logicalBodies(key, value, path, errors))
        errors.push(...validateTargetWhere(item, target, registry, itemPath, fieldPath));
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

  // Without a registry the target model of a relation is unknown, so the filter would compile against the
  // virtual relation field, which is always NONE
  if (field.type === 'relation' && !registry) {
    errors.push({
      path,
      message: `'${fieldName}' is a relation on ${model.name}; a model registry is required to filter on a relation, pass it as the last argument`,
    });

    return errors;
  }

  // The builder has no condition for a reverse relation compared to null and would drop the key, widening the filter
  if (field.type === 'relation' && filter === null && field.relationInfo?.isReverse) {
    errors.push({
      path,
      message: `'${fieldName}' is a reverse relation on ${model.name} and cannot be compared to null; use { ${fieldName}: { isEmpty: true } } to match rows with no related records`,
    });

    return errors;
  }

  // A relation filter is a where on the target; any other value compiles to a comparison that never holds
  if (field.type === 'relation' && filter !== null && filter !== undefined && !isObject(filter)) {
    errors.push({
      path,
      message: `The filter on relation '${fieldName}' of model ${model.name} must be an object, got ${Array.isArray(filter) ? 'an array' : typeof filter}`,
    });

    return errors;
  }

  // For record fields with typed IDs, validate direct values against expected types
  if (field.type === 'record' && field.recordIdTypes?.length && !field.isArray) {
    if (!isObject(filter)) {
      if (!(filter === null && field.isNullable) && !validateTypedRecordId(filter, field.recordIdTypes)) {
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
        field.objectInfo,
        field.isFlexible,
        field.isArray,
        model,
        path,
        fieldName,
        NO_DEFS,
      );
    }

    // For tuple fields, the filter object contains element conditions by name/index
    // e.g., location: { lat: { gt: 1.0 } } or location: { 0: { gt: 1.0 } }
    if (field.type === 'tuple' && field.tupleInfo) {
      return validateTupleFilter(filter, field.tupleInfo, field.isArray, model, path, fieldName, NO_DEFS);
    }

    errors.push(...operatorKeyIssues(filter, path));
  }

  errors.push(...operandIssues(field, filter, path, fieldName, model));

  return errors;
}

/** The message for a `$raw` value that is not a fragment built by the `sql` tag */
function rawValueIssue(path: string, value: unknown): CerialValidationIssue {
  return {
    path,
    message:
      value === undefined
        ? `${path} is undefined, which would drop the filter and widen the statement; omit the key or pass a fragment built by the sql tag`
        : `${path} must be a fragment built by the sql tag`,
  };
}

/**
 * Deepest object nesting a where may have. The server already refuses a `NOT` or `OR` chain near depth 20, so
 * real queries stay far below this; the cap only stops hostile input from overflowing the call stack in the
 * recursive walks below and in the compiler, which would surface as a bare RangeError.
 */
export const MAX_WHERE_DEPTH = 128;

/** Refuse a value nested deeper than the cap. Iterative, so the check itself cannot overflow the stack. */
function assertWhereDepth(where: unknown, path: string): void {
  const stack: Array<[unknown, number]> = [[where, 1]];

  while (stack.length) {
    const [node, depth] = stack.pop()!;
    if (Array.isArray(node)) {
      for (const child of node) stack.push([child, depth]);
      continue;
    }
    if (!isObject(node)) continue;
    const proto = Object.getPrototypeOf(node);
    if (proto !== Object.prototype && proto !== null) continue;

    if (depth > MAX_WHERE_DEPTH)
      throw new CerialValidationError(
        `${path} is nested deeper than ${MAX_WHERE_DEPTH} levels (reached depth ${depth}); flatten the filter`,
        { operation: 'where' },
      );
    for (const child of Object.values(node)) stack.push([child, depth + 1]);
  }
}

/** Validate a where clause recursively */
export function validateWhereClause(
  where: WhereClause,
  model: ModelMetadata,
  path: string = 'where',
  registry?: ModelRegistry,
): CerialValidationIssue[] {
  if (!isObject(where))
    return [
      {
        path,
        message: `${path} must be an object, got ${where === null ? 'null' : Array.isArray(where) ? 'an array' : typeof where}; omit it to filter nothing`,
      },
    ];

  assertWhereDepth(where, path);

  return walkWhereClause(where, model, path, registry);
}

function walkWhereClause(
  where: WhereClause,
  model: ModelMetadata,
  path: string,
  registry?: ModelRegistry,
): CerialValidationIssue[] {
  const errors: CerialValidationIssue[] = [];

  for (const [key, value] of Object.entries(where)) {
    // Ahead of the undefined skip: a conditional fragment that came out undefined must refuse, not vanish
    if (key === '$raw') {
      if (!isSqlFragment(value)) errors.push(rawValueIssue(`${path}.$raw`, value));
      continue;
    }

    if (value === undefined) continue;

    if (LOGICAL_KEYS.includes(key)) {
      for (const [item, itemPath] of logicalBodies(key, value, path, errors))
        errors.push(...walkWhereClause(item as WhereClause, model, itemPath, registry));
      continue;
    }

    // Validate field filter. A `$raw` inside a relation filter keeps its own message, so that check goes first there.
    const refuse = () => refuseFragmentInValue(value, `${path}.${key}`, { model: model.name });
    const isRelation = model.fields.some((f) => f.name === key && f.type === 'relation');
    if (!isRelation) refuse();
    const issues = validateFieldFilter(key, value, model, `${path}.${key}`, registry);
    errors.push(...issues);
    if (isRelation && !issues.length) refuse();
  }

  return errors;
}

/** Validate a where clause and return result */
export function validateWhere(
  where: WhereClause | undefined,
  model: ModelMetadata,
  registry?: ModelRegistry,
): WhereValidationResult {
  if (where === undefined) return { valid: true, errors: [] };

  const errors = validateWhereClause(where, model, 'where', registry);
  return {
    valid: errors.length === 0,
    errors,
  };
}
