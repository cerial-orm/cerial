/**
 * Greater than or equal operator handler
 */

import type { FieldMetadata } from '../../../types';
import type { QueryFragment } from '../../compile/types';
import type { FilterCompileContext } from '../../compile/var-allocator';

/** Handle gte (greater than or equal) operator */
export function handleGte(
  ctx: FilterCompileContext,
  field: string,
  value: unknown,
  fieldMetadata: FieldMetadata,
): QueryFragment {
  const v = ctx.bind(field, 'gte', value, fieldMetadata.type);
  return { text: `${field} >= ${v.placeholder}`, vars: v.vars };
}
