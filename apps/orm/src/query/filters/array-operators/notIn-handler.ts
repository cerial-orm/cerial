/**
 * NOT IN operator handler
 */

import type { FieldMetadata } from '../../../types';
import type { QueryFragment } from '../../compile/types';
import type { FilterCompileContext } from '../../compile/var-allocator';
import { bindOperand } from '../set-operand';

/** Handle notIn operator */
export function handleNotIn(
  ctx: FilterCompileContext,
  field: string,
  values: unknown[],
  fieldMetadata: FieldMetadata,
): QueryFragment {
  const v = bindOperand(ctx, field, 'notIn', values, fieldMetadata, 'valueList');
  return { text: `${field} NOT IN ${v.placeholder}`, vars: v.vars };
}
