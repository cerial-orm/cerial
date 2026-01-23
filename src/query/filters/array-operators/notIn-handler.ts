/**
 * NOT IN operator handler
 */

import type { QueryFragment } from '../../compile/types';
import type { FilterCompileContext } from '../../compile/var-allocator';
import type { FieldMetadata } from '../../../types';

/** Handle notIn operator */
export function handleNotIn(
  ctx: FilterCompileContext,
  field: string,
  values: unknown[],
  fieldMetadata: FieldMetadata,
): QueryFragment {
  const v = ctx.bind(field, 'notIn', values, fieldMetadata.type);
  return { text: `${field} NOT IN ${v.placeholder}`, vars: v.vars };
}
