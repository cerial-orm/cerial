/**
 * OR operator handler
 */

import { joinFragments, wrapParens } from '../../compile/fragment';
import type { QueryFragment } from '../../compile/types';

/** Handle OR logic - combines conditions with OR. An empty disjunction is false, so it matches no row. */
export function handleOr(all: QueryFragment[]): QueryFragment {
  if (all.length === 0) return { text: 'false', vars: {} };
  // A constant false adds nothing to a disjunction; when every branch is false so is the whole
  const conditions = all.filter((c) => c.text !== 'false');
  if (!conditions.length) return { text: 'false', vars: {} };
  if (conditions.length === 1) return conditions[0]!;

  const joined = joinFragments(conditions, ' OR ');
  return wrapParens(joined);
}
