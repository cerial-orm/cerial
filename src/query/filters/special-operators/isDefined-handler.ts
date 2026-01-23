/**
 * IsDefined operator handler
 */

import type { QueryFragment } from '../../compile/types';

/** Handle isDefined operator */
export function handleIsDefined(field: string): QueryFragment {
  return { text: `${field} != NONE`, vars: {} };
}
