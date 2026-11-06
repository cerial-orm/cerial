/**
 * OR operator handler
 */

import { joinFragments, wrapParens } from '../../compile/fragment';
import type { QueryFragment } from '../../compile/types';

/**
 * Handle OR logic - combines conditions with OR. An empty disjunction is false, so it matches no row. An empty
 * branch is a condition that matches every row, so one makes the whole disjunction always true, which is the
 * empty fragment; dropping it instead would let a NOT around the OR match rows the written filter excludes.
 */
export function handleOr(all: QueryFragment[]): QueryFragment {
  if (all.length === 0) return { text: 'false', vars: {} };
  if (all.some((c) => !c.text)) return { text: '', vars: {} };
  // A constant false adds nothing to a disjunction; when every branch is false so is the whole
  const conditions = all.filter((c) => c.text !== 'false');
  if (!conditions.length) return { text: 'false', vars: {} };
  if (conditions.length === 1) return conditions[0]!;

  const joined = joinFragments(conditions, ' OR ');
  return wrapParens(joined);
}
