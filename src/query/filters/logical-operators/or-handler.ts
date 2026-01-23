/**
 * OR operator handler
 */

import type { QueryFragment } from '../../compile/types';
import { joinFragments, wrapParens } from '../../compile/fragment';

/** Handle OR logic - combines conditions with OR */
export function handleOr(conditions: QueryFragment[]): QueryFragment {
  if (conditions.length === 0) return { text: '', vars: {} };
  if (conditions.length === 1) return conditions[0]!;

  const joined = joinFragments(conditions, ' OR ');
  return wrapParens(joined);
}
