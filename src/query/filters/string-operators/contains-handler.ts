/**
 * Contains operator handler
 */

import type { QueryFragment } from '../../compile/types';
import type { FilterCompileContext } from '../../compile/var-allocator';
import type { FieldMetadata } from '../../../types';
import { escapeRegex } from '../../../utils/string-utils';

/** Handle contains operator */
export function handleContains(
  ctx: FilterCompileContext,
  field: string,
  value: string,
  fieldMetadata: FieldMetadata,
): QueryFragment {
  // Use regex pattern for contains
  const pattern = `.*${escapeRegex(value)}.*`;
  const v = ctx.bind(field, 'contains', pattern, fieldMetadata.type);
  return { text: `string::lowercase(${field}) ~ string::lowercase(${v.placeholder})`, vars: v.vars };
}
