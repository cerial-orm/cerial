/**
 * NOT operator handler
 */

import { wrapParens } from '../../compile/fragment';
import type { QueryFragment } from '../../compile/types';

/** Handle NOT logic - negates a condition. An empty condition matches every row, so its negation matches none. */
export function handleNot(condition: QueryFragment): QueryFragment {
  if (!condition.text) return { text: 'false', vars: {} };

  const wrapped = wrapParens(condition);
  return {
    text: `NOT ${wrapped.text}`,
    vars: wrapped.vars,
  };
}
