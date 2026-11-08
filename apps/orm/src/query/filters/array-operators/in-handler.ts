/**
 * IN operator handler
 */

import type { FieldMetadata } from '../../../types';
import type { QueryFragment } from '../../compile/types';
import type { FilterCompileContext } from '../../compile/var-allocator';
import { bindOperand } from '../set-operand';

/** Handle in operator */
export function handleIn(
  ctx: FilterCompileContext,
  field: string,
  values: unknown[],
  fieldMetadata: FieldMetadata,
): QueryFragment {
  const v = bindOperand(ctx, field, 'in', values, fieldMetadata, 'valueList');
  return { text: `${field} IN ${v.placeholder}`, vars: v.vars };
}
