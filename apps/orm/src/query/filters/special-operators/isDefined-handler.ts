/**
 * IsDefined operator handler - checks if a field is present (not NONE)
 *
 * SurrealDB distinguishes between NONE (field absent) and NULL (field with null value).
 * Use this operator to check for field presence:
 * - { isDefined: true } → field is present (not NONE, but could be null or have a value)
 * - { isDefined: false } → field is absent (NONE)
 */

import type { QueryFragment } from '../../compile/types';

/** Handle isDefined: true → field != NONE */
export function handleIsDefined(field: string): QueryFragment {
  return { text: `${field} != NONE`, vars: {} };
}

/** Handle isDefined: false → field = NONE */
export function handleIsNotDefined(field: string): QueryFragment {
  return { text: `${field} = NONE`, vars: {} };
}
