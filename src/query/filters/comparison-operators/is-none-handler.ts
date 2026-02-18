/**
 * IsNone operator handler - checks if a field is absent (NONE)
 *
 * SurrealDB distinguishes between NONE (field absent) and NULL (field with null value).
 * Use this operator to check for field presence:
 * - { isNone: true } → field is absent (NONE)
 * - { isNone: false } → field is present (not NONE, but could be NULL or have a value)
 */

import type { FieldMetadata } from '../../../types';
import type { QueryFragment } from '../../compile/types';
import type { FilterCompileContext } from '../../compile/var-allocator';

/** Handle isNone operator - checks if field is absent (NONE) */
export function handleIsNone(
  _ctx: FilterCompileContext,
  field: string,
  value: unknown,
  _fieldMetadata: FieldMetadata,
): QueryFragment {
  // { isNone: true } → field == NONE (field is absent)
  // { isNone: false } → field != NONE (field is present)
  if (value === true) {
    return { text: `${field} = NONE`, vars: {} };
  }

  return { text: `${field} != NONE`, vars: {} };
}
