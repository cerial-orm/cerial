/**
 * StartsWith operator handler
 */

import type { QueryFragment } from '../../compile/types';
import type { FilterCompileContext } from '../../compile/var-allocator';
import type { FieldMetadata } from '../../../types';

/** Handle startsWith operator */
export function handleStartsWith(
  ctx: FilterCompileContext,
  field: string,
  value: string,
  fieldMetadata: FieldMetadata,
): QueryFragment {
  // Use SurrealDB's native string::starts_with function
  const v = ctx.bind(field, 'startsWith', value, fieldMetadata.type);
  return { text: `string::starts_with(${field}, ${v.placeholder})`, vars: v.vars };
}
