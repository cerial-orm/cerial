/**
 * Equality operator handler
 */

import type { QueryFragment } from '../../compile/types';
import type { FilterCompileContext } from '../../compile/var-allocator';
import type { FieldMetadata } from '../../../types';

/** Handle eq (equals) operator */
export function handleEq(
  ctx: FilterCompileContext,
  field: string,
  value: unknown,
  fieldMetadata: FieldMetadata,
): QueryFragment {
  const v = ctx.bind(field, 'eq', value, fieldMetadata.type);
  return { text: `${field} = ${v.placeholder}`, vars: v.vars };
}
