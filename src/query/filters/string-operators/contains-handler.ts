/**
 * Contains operator handler
 */

import type { FieldMetadata } from '../../../types';
import type { QueryFragment } from '../../compile/types';
import type { FilterCompileContext } from '../../compile/var-allocator';

/** Handle contains operator */
export function handleContains(
  ctx: FilterCompileContext,
  field: string,
  value: string,
  fieldMetadata: FieldMetadata,
): QueryFragment {
  // Use SurrealDB's native string::contains function
  const v = ctx.bind(field, 'contains', value, fieldMetadata.type);
  return { text: `string::contains(${field}, ${v.placeholder})`, vars: v.vars };
}
