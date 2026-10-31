/**
 * NOT operator handler
 */

import { wrapParens } from '../../compile/fragment';
import type { QueryFragment } from '../../compile/types';

/**
 * Handle NOT logic - negates a condition. An empty condition matches every row, so its negation matches none,
 * and the negation of the constant `false` matches every row, which is an empty condition again. Folding it
 * keeps a double negation from compiling to `NOT (false)`, a filter that looks present but widens nothing away.
 */
export function handleNot(condition: QueryFragment): QueryFragment {
  if (!condition.text) return { text: 'false', vars: {} };
  if (condition.text === 'false') return { text: '', vars: {} };

  const wrapped = wrapParens(condition);
  return {
    text: `NOT ${wrapped.text}`,
    vars: wrapped.vars,
  };
}
