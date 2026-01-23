/**
 * AND operator handler
 */

import type { QueryFragment } from '../../compile/types';
import { joinFragments, wrapParens } from '../../compile/fragment';

/** Handle AND logic - combines conditions with AND */
export function handleAnd(conditions: QueryFragment[]): QueryFragment {
  if (conditions.length === 0) return { text: '', vars: {} };
  if (conditions.length === 1) return conditions[0]!;

  const joined = joinFragments(conditions, ' AND ');
  return wrapParens(joined);
}
