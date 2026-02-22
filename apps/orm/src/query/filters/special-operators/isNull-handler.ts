/**
 * IsNull operator handler - checks if a field is explicitly null
 *
 * SurrealDB distinguishes between NONE (field absent) and NULL (field with null value).
 * Use this operator to check for null values:
 * - { isNull: true } → field is null
 * - { isNull: false } → field is not null (could be NONE or have a value)
 */

import type { QueryFragment } from '../../compile/types';

/** Handle isNull: true → field = NULL */
export function handleIsNull(field: string): QueryFragment {
  return { text: `${field} = NULL`, vars: {} };
}

/** Handle isNull: false → field != NULL */
export function handleIsNotNull(field: string): QueryFragment {
  return { text: `${field} != NULL`, vars: {} };
}
