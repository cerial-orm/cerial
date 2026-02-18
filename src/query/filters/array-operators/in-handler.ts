/**
 * IN operator handler
 */

import type { FieldMetadata } from '../../../types';
import type { QueryFragment } from '../../compile/types';
import type { FilterCompileContext } from '../../compile/var-allocator';

/** Handle in operator */
export function handleIn(
  ctx: FilterCompileContext,
  field: string,
  values: unknown[],
  fieldMetadata: FieldMetadata,
): QueryFragment {
  const v = ctx.bind(field, 'in', values, fieldMetadata.type);
  return { text: `${field} IN ${v.placeholder}`, vars: v.vars };
}
