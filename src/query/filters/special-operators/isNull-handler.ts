/**
 * IsNull operator handler
 */

import type { QueryFragment } from '../../compile/types';

/** Handle isNull operator */
export function handleIsNull(field: string): QueryFragment {
  return { text: `${field} = NONE`, vars: {} };
}
