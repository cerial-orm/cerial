/**
 * AND operator handler
 */

import { joinFragments, wrapParens } from '../../compile/fragment';
import type { QueryFragment } from '../../compile/types';

/** Handle AND logic - combines conditions with AND */
export function handleAnd(conditions: QueryFragment[]): QueryFragment {
  if (conditions.length === 0) return { text: '', vars: {} };
  // One constant false makes the whole conjunction false; folded so a NOT around it reads as always true
  if (conditions.some((c) => c.text === 'false')) return { text: 'false', vars: {} };
  if (conditions.length === 1) return conditions[0]!;

  const joined = joinFragments(conditions, ' AND ');
  return wrapParens(joined);
}
