/**
 * A `@set` field is stored as a set, which the database never compares equal to a plain array. The operand
 * is cast to a set the way create stores it (deduplicated, sorted) before it is compared.
 */

import type { FieldMetadata } from '../../types';
import type { VarBinding } from '../compile/types';
import type { FilterCompileContext } from '../compile/var-allocator';

/**
 * Bind a comparison operand by its shape (see `OperandShape`): a whole-value operand is cast to a set, and a
 * value list has each member cast, so the database compares a set with a set.
 */
export function bindOperand(
  ctx: FilterCompileContext,
  field: string,
  operator: string,
  value: unknown,
  fieldMetadata: FieldMetadata,
  shape: 'value' | 'valueList',
): VarBinding {
  const bound = ctx.bind(field, operator, value, fieldMetadata.type);
  if (!fieldMetadata.isSet) return bound;

  if (shape === 'valueList')
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
