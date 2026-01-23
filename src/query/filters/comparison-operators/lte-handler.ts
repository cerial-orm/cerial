/**
 * Less than or equal operator handler
 */

import type { QueryFragment } from '../../compile/types';
import type { FilterCompileContext } from '../../compile/var-allocator';
import type { FieldMetadata } from '../../../types';

/** Handle lte (less than or equal) operator */
export function handleLte(
  ctx: FilterCompileContext,
  field: string,
  value: unknown,
  fieldMetadata: FieldMetadata,
): QueryFragment {
  const v = ctx.bind(field, 'lte', value, fieldMetadata.type);
  return { text: `${field} <= ${v.placeholder}`, vars: v.vars };
}
