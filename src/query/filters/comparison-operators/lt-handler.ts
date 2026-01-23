/**
 * Less than operator handler
 */

import type { QueryFragment } from '../../compile/types';
import type { FilterCompileContext } from '../../compile/var-allocator';
import type { FieldMetadata } from '../../../types';

/** Handle lt (less than) operator */
export function handleLt(
  ctx: FilterCompileContext,
  field: string,
  value: unknown,
  fieldMetadata: FieldMetadata,
): QueryFragment {
  const v = ctx.bind(field, 'lt', value, fieldMetadata.type);
  return { text: `${field} < ${v.placeholder}`, vars: v.vars };
}
