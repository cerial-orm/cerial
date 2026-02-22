/**
 * OR operator handler
 */

import { joinFragments, wrapParens } from '../../compile/fragment';
import type { QueryFragment } from '../../compile/types';

/** Handle OR logic - combines conditions with OR */
export function handleOr(conditions: QueryFragment[]): QueryFragment {
  if (conditions.length === 0) return { text: '', vars: {} };
  if (conditions.length === 1) return conditions[0]!;

  const joined = joinFragments(conditions, ' OR ');
  return wrapParens(joined);
}
