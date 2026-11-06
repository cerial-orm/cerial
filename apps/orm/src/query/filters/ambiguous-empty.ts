/**
 * A write cannot tell "no condition" from "every row that has one", so the empty shapes that a read gives a
 * meaning are refused where a where selects rows to change or delete: an empty body on a forward to-one
 * relation (`{}`, `{ AND: [] }`, `{ name: undefined }`, `{ name: {} }`), a reverse or array-FK relation body that names
 * no quantifier and no condition (`{}`, `{ some: undefined }`), an empty object or tuple field filter (`addr: {}`,
 * `addr: { city: {} }`) and an empty operator object on a field.
 * Quantifier bodies (`some: {}`) and `isEmpty` keep their meaning and pass.
 */
import type { FieldMetadata, ModelMetadata, ModelRegistry, WhereClause } from '../../types';
import { CerialValidationError } from '../../errors';
import { isObject } from '../../utils/type-utils';
import { isOperatorShape, resolveTupleElementKey } from './condition-builder';
import { isEmptyBody } from './nested-condition-builder';

const QUANTIFIERS = ['some', 'every', 'none', 'isEmpty'];

const allUndefined = (value: object): boolean => Object.values(value).every((v) => v === undefined);

/** Finds the field a key names inside an object or tuple field; undefined for a key the type does not declare */
type SubFields = (key: string) => FieldMetadata | undefined;

function subFieldsOf(field: FieldMetadata): SubFields | undefined {
  const { objectInfo, tupleInfo } = field;
  if (field.type === 'object' && objectInfo) return (key) => objectInfo.fields.find((f) => f.name === key);
  if (field.type === 'tuple' && tupleInfo) return (key) => resolveTupleElementKey(key, tupleInfo)?.syntheticField;

  return undefined;
}

/**
 * True when a body inside an object or tuple field states no condition. A key the type does not declare is a value
 * comparison on a `@flexible` sub-key (`extra: {}` compares with the empty object), so it counts as a condition.
 */
function isEmptyFieldBody(where: Record<string, unknown>, sub: SubFields): boolean {
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;
    if ((key === 'AND' || key === 'OR') && Array.isArray(value)) {
      // An empty OR is the constant false, not an absent condition
      if (key === 'OR' && !value.length) return false;
      if (value.every((w) => isObject(w) && isEmptyFieldBody(w, sub))) continue;
      return false;
    }
    if (key === 'NOT' && isObject(value) && isEmptyFieldBody(value, sub)) continue;

    const field = sub(key);
    if (!field || !isObject(value)) return false;
    const inner = subFieldsOf(field);
    if (inner && !field.isArray) {
      if (isEmptyFieldBody(value, inner)) continue;
      return false;
    }
    if (field.isArray && inner) {
      if (allUndefined(value)) continue;
      return false;
    }
    if (!isOperatorShape(value, field) || !allUndefined(value)) return false;
  }

  return true;
}

function refuse(operation: string, model: ModelMetadata, field: string, path: string, hint: string): never {
  throw new CerialValidationError(
    `${operation} on ${model.name}: the filter '${path}' is empty, so it is ambiguous on a write. ${hint}`,
    { model: model.name, operation, field },
  );
}

/** Throws a CerialValidationError for an empty relation body or empty operator object anywhere in the where */
export function assertNoAmbiguousEmpty(
  where: WhereClause | undefined,
  model: ModelMetadata,
  registry: ModelRegistry | undefined,
  operation: string,
  path: string = 'where',
): void {
  if (!isObject(where)) return;

  for (const [key, value] of Object.entries(where)) {
    if (value === undefined || key === '$raw') continue;

    if (key === 'AND' || key === 'OR') {
      if (Array.isArray(value))
        value.forEach((w, i) => assertNoAmbiguousEmpty(w, model, registry, operation, `${path}.${key}[${i}]`));
      continue;
    }
    if (key === 'NOT') {
      assertNoAmbiguousEmpty(value as WhereClause, model, registry, operation, `${path}.NOT`);
      continue;
    }

    const field = model.fields.find((f) => f.name === key);
    if (!field || !isObject(value)) continue;
    const here = `${path}.${key}`;

    if (field.type === 'relation') {
      const info = field.relationInfo;
      const target = info && registry ? registry[info.targetModel] : undefined;
      if (!info) continue;

      if (!info.isReverse && !field.isArray) {
        const empty = target
          ? isEmptyBody(value as WhereClause, target)
          : Object.values(value).every((v) => v === undefined);
        if (empty)
          refuse(
            operation,
            model,
            key,
            here,
            `Name the rows explicitly: ${key}: null for no related record however the key is stored, NOT: { ${key}: null } for a related record that exists, or ${info.fieldRef}: null / ${info.fieldRef}: { isNone: true } for one stored state; or give the body a condition.`,
          );
        if (target) assertNoAmbiguousEmpty(value as WhereClause, target, registry, operation, here);
        continue;
      }

      if (!target) continue;
      const rest: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        if (QUANTIFIERS.includes(k)) {
          if (isObject(v)) assertNoAmbiguousEmpty(v as WhereClause, target, registry, operation, `${here}.${k}`);
        } else rest[k] = v;
      }
      // Keys present with undefined values (`some: req.body.x` with x absent) are dropped, and with them the filter
      if (
        !Object.keys(value).some((k) => QUANTIFIERS.includes(k) && value[k] !== undefined) &&
        isEmptyBody(rest as WhereClause, target)
      )
        refuse(
          operation,
          model,
          key,
          here,
          `Name the rows explicitly: ${key}: { some: {} } for a related record, ${key}: { none: {} } or ${key}: { isEmpty: true } for none; or give the body a condition.`,
        );
      assertNoAmbiguousEmpty(rest as WhereClause, target, registry, operation, here);
      continue;
    }

    const inner = subFieldsOf(field);
    if (inner) {
      assertFieldBody(value, here, field, inner, (path, hint) => refuse(operation, model, key, path, hint));
      continue;
    }
    if (isOperatorShape(value, field) && Object.values(value).every((v) => v === undefined))
      refuse(operation, model, key, here, `Give ${key} a real operator such as { eq: ... }, or drop the key.`);
  }
}

const FIELD_HINT = (key: string): string =>
  `Name a condition on one of ${key}'s sub-fields, such as ${key}: { <field>: <value> }.`;

/**
 * Walks an object or tuple field filter. A quantifier body on an array field (`some: {}`) is an explicit form and
 * passes; everything else that states no condition is refused, at any depth.
 */
function assertFieldBody(
  value: Record<string, unknown>,
  root: string,
  field: FieldMetadata,
  sub: SubFields,
  fail: (path: string, hint: string) => never,
): void {
  const hint = FIELD_HINT(field.name);
  const walk = (body: Record<string, unknown>, fields: SubFields, allowEmpty: boolean, path: string): void => {
    if (!allowEmpty && isEmptyFieldBody(body, fields)) fail(path, hint);

    for (const [key, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (key === 'AND' || key === 'OR') {
        if (Array.isArray(v)) v.forEach((w, i) => isObject(w) && walk(w, fields, true, `${path}.${key}[${i}]`));
        continue;
      }
      if (key === 'NOT') {
        if (isObject(v)) walk(v, fields, true, `${path}.NOT`);
        continue;
      }

      const child = fields(key);
      if (!child || !isObject(v)) continue;
      const here = `${path}.${key}`;
      const inner = subFieldsOf(child);
      if (!inner) {
        if (isOperatorShape(v, child) && allUndefined(v))
          fail(here, `Give ${key} a real operator such as { eq: ... }, or drop the key.`);
        continue;
      }
      if (!child.isArray) {
        walk(v, inner, false, here);
        continue;
      }
      for (const [q, qBody] of Object.entries(v)) if (isObject(qBody)) walk(qBody, inner, true, `${here}.${q}`);
    }
  };

  if (field.isArray) {
    if (allUndefined(value)) fail(root, `Use some: {}, none: {} or every: {}, or give the body a condition.`);
    for (const [q, qBody] of Object.entries(value)) if (isObject(qBody)) walk(qBody, sub, true, `${root}.${q}`);

    return;
  }
  walk(value, sub, false, root);
}
