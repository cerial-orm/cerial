/**
 * Not operator handler - handles { not: value } syntax
 */

import type { FieldMetadata } from '../../../types';
import type { QueryFragment } from '../../compile/types';
import type { FilterCompileContext } from '../../compile/var-allocator';
import { bindOperand } from '../set-operand';

/** Handle not operator - negates a value comparison */
export function handleNot(
  ctx: FilterCompileContext,
  field: string,
  value: unknown,
  fieldMetadata: FieldMetadata,
): QueryFragment {
  // Handle { not: null } - means field is NOT null specifically
  // Use { isNone: false } to check for field presence (not NONE)
  if (value === null) {
    return { text: `${field} != NULL`, vars: {} };
  }

  // Handle { not: someValue } - means field != value
  const v = bindOperand(ctx, field, 'not', value, fieldMetadata, 'value');

  return { text: `${field} != ${v.placeholder}`, vars: v.vars };
}
