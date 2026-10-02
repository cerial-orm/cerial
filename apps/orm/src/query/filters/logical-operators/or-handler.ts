/**
 * OR operator handler
 */

import { joinFragments, wrapParens } from '../../compile/fragment';
import type { QueryFragment } from '../../compile/types';

/** Handle OR logic - combines conditions with OR. An empty disjunction is false, so it matches no row. */
export function handleOr(conditions: QueryFragment[]): QueryFragment {
  if (conditions.length === 0) return { text: 'false', vars: {} };
  if (conditions.length === 1) return conditions[0]!;

  const joined = joinFragments(conditions, ' OR ');
  return wrapParens(joined);
}
