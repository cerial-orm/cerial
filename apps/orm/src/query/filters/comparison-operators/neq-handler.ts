/**
 * Not equals operator handler
 */

import type { FieldMetadata } from '../../../types';
import type { QueryFragment } from '../../compile/types';
import type { FilterCompileContext } from '../../compile/var-allocator';
import { bindOperand } from '../set-operand';

/** Handle neq (not equals) operator */
export function handleNeq(
  ctx: FilterCompileContext,
  field: string,
  value: unknown,
  fieldMetadata: FieldMetadata,
): QueryFragment {
  const v = bindOperand(ctx, field, 'neq', value, fieldMetadata);
  return { text: `${field} != ${v.placeholder}`, vars: v.vars };
}
