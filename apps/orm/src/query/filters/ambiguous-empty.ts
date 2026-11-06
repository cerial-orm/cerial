/**
 * A write cannot tell "no condition" from "every row that has one", so the empty shapes that a read gives a
 * meaning are refused where a where selects rows to change or delete: an empty body on a forward to-one
 * relation (`{}`, `{ AND: [] }`, `{ name: undefined }`, `{ name: {} }`) and an empty operator object on a field.
 * Quantifier bodies (`some: {}`) and `isEmpty` keep their meaning and pass.
 */
import type { ModelMetadata, ModelRegistry, WhereClause } from '../../types';
import { CerialValidationError } from '../../errors';
import { isObject } from '../../utils/type-utils';
import { isOperatorShape } from './condition-builder';
import { isEmptyBody } from './nested-condition-builder';

const QUANTIFIERS = ['some', 'every', 'none', 'isEmpty'];

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
      assertNoAmbiguousEmpty(rest as WhereClause, target, registry, operation, here);
      continue;
    }

    if (field.type === 'object' || field.type === 'tuple') continue;
    if (isOperatorShape(value, field) && Object.values(value).every((v) => v === undefined))
      refuse(operation, model, key, here, `Give ${key} a real operator such as { eq: ... }, or drop the key.`);
  }
}
