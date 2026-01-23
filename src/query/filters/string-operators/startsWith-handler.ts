/**
 * StartsWith operator handler
 */

import type { QueryFragment } from '../../compile/types';
import type { FilterCompileContext } from '../../compile/var-allocator';
import type { FieldMetadata } from '../../../types';
import { escapeRegex } from '../../../utils/string-utils';

/** Handle startsWith operator */
export function handleStartsWith(
  ctx: FilterCompileContext,
  field: string,
  value: string,
  fieldMetadata: FieldMetadata,
): QueryFragment {
  // Use regex pattern for startsWith
  const pattern = `^${escapeRegex(value)}.*`;
  const v = ctx.bind(field, 'startsWith', pattern, fieldMetadata.type);
  return { text: `${field} ~ ${v.placeholder}`, vars: v.vars };
}
