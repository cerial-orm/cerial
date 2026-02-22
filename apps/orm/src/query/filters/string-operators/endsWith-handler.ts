/**
 * EndsWith operator handler
 */

import type { FieldMetadata } from '../../../types';
import type { QueryFragment } from '../../compile/types';
import type { FilterCompileContext } from '../../compile/var-allocator';

/** Handle endsWith operator */
export function handleEndsWith(
  ctx: FilterCompileContext,
  field: string,
  value: string,
  fieldMetadata: FieldMetadata,
): QueryFragment {
  // Use SurrealDB's native string::ends_with function
  const v = ctx.bind(field, 'endsWith', value, fieldMetadata.type);
  return { text: `string::ends_with(${field}, ${v.placeholder})`, vars: v.vars };
}
