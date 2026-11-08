/**
 * A `@set` field is stored as a set, which the database never compares equal to a plain array. The operand
 * is cast to a set the way create stores it (deduplicated, sorted) before it is compared.
 */

import type { FieldMetadata } from '../../types';
import type { VarBinding } from '../compile/types';
import type { FilterCompileContext } from '../compile/var-allocator';

/**
 * Bind a comparison operand. For a set field an array operand is cast to a set, and a list operand
 * (in, notIn) has each array member cast, anything else left for the database to compare.
 */
export function bindOperand(
  ctx: FilterCompileContext,
  field: string,
  operator: string,
  value: unknown,
  fieldMetadata: FieldMetadata,
): VarBinding {
  const bound = ctx.bind(field, operator, value, fieldMetadata.type);
  if (!fieldMetadata.isSet) return bound;

  if (operator === 'in' || operator === 'notIn')
    return { ...bound, placeholder: `${bound.placeholder}.map(|$m| IF type::is_array($m) { <set>$m } ELSE { $m })` };

  return Array.isArray(value) ? { ...bound, placeholder: `<set>${bound.placeholder}` } : bound;
}

/**
 * Only a column of the model is stored as a set. A @set sub-field of an object is defined as a plain
 * array, so its operand is compared as one.
 */
export function asStoredArray(subField: FieldMetadata): FieldMetadata {
  return subField.isSet ? { ...subField, isSet: false } : subField;
}
