/**
 * Equality operator handler
 */

import type { FieldMetadata } from '../../../types';
import type { QueryFragment } from '../../compile/types';
import type { FilterCompileContext } from '../../compile/var-allocator';
import { bindOperand } from '../set-operand';

/** Handle eq (equals) operator */
export function handleEq(
  ctx: FilterCompileContext,
  field: string,
  value: unknown,
  fieldMetadata: FieldMetadata,
): QueryFragment {
  // Handle null values - check for NULL specifically
  // Use { isNone: true } to check for absent fields (NONE)
  if (value === null) {
    return { text: `${field} = NULL`, vars: {} };
  }

  const v = bindOperand(ctx, field, 'eq', value, fieldMetadata);

  return { text: `${field} = ${v.placeholder}`, vars: v.vars };
}
