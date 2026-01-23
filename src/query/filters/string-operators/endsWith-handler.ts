/**
 * EndsWith operator handler
 */

import type { QueryFragment } from '../../compile/types';
import type { FilterCompileContext } from '../../compile/var-allocator';
import type { FieldMetadata } from '../../../types';
import { escapeRegex } from '../../../utils/string-utils';

/** Handle endsWith operator */
export function handleEndsWith(
  ctx: FilterCompileContext,
  field: string,
  value: string,
  fieldMetadata: FieldMetadata,
): QueryFragment {
  // Use regex pattern for endsWith
  const pattern = `.*${escapeRegex(value)}$`;
  const v = ctx.bind(field, 'endsWith', pattern, fieldMetadata.type);
  return { text: `${field} ~ ${v.placeholder}`, vars: v.vars };
}
