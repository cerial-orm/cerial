/**
 * NOT operator handler
 */

import type { QueryFragment } from '../../compile/types';
import { wrapParens } from '../../compile/fragment';

/** Handle NOT logic - negates a condition */
export function handleNot(condition: QueryFragment): QueryFragment {
  if (!condition.text) return { text: '', vars: {} };

  const wrapped = wrapParens(condition);
  return {
    text: `NOT ${wrapped.text}`,
    vars: wrapped.vars,
  };
}
