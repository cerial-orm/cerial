/**
 * Not equals operator handler
 */

import type { QueryFragment } from '../../compile/types';
import type { FilterCompileContext } from '../../compile/var-allocator';
import type { FieldMetadata } from '../../../types';

/** Handle neq (not equals) operator */
export function handleNeq(
  ctx: FilterCompileContext,
  field: string,
  value: unknown,
  fieldMetadata: FieldMetadata,
): QueryFragment {
  const v = ctx.bind(field, 'neq', value, fieldMetadata.type);
  return { text: `${field} != ${v.placeholder}`, vars: v.vars };
}
