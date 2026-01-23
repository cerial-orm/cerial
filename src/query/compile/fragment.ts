/**
 * Query fragment helpers
 */

import type { QueryFragment, QueryVars, CompiledQuery } from './types';
import { EMPTY_FRAGMENT } from './types';

/** Create a query fragment */
export function createFragment(text: string, vars: QueryVars = {}): QueryFragment {
  return { text, vars };
}

/** Merge two fragments with a separator */
export function mergeFragments(
  a: QueryFragment,
  b: QueryFragment,
  separator: string = ' ',
): QueryFragment {
  if (!a.text && !b.text) return EMPTY_FRAGMENT;
  if (!a.text) return b;
  if (!b.text) return a;

  return {
    text: `${a.text}${separator}${b.text}`,
    vars: { ...a.vars, ...b.vars },
  };
}

/** Join multiple fragments with a separator */
export function joinFragments(
  fragments: QueryFragment[],
  separator: string = ' ',
): QueryFragment {
  const nonEmpty = fragments.filter((f) => f.text);
  if (nonEmpty.length === 0) return EMPTY_FRAGMENT;
  if (nonEmpty.length === 1) return nonEmpty[0]!;

  return {
    text: nonEmpty.map((f) => f.text).join(separator),
    vars: Object.assign({}, ...nonEmpty.map((f) => f.vars)),
  };
}

/** Wrap a fragment with parentheses */
export function wrapParens(fragment: QueryFragment): QueryFragment {
  if (!fragment.text) return fragment;
  return {
    text: `(${fragment.text})`,
    vars: fragment.vars,
  };
}

/** Convert a fragment to a compiled query */
export function fragmentToQuery(fragment: QueryFragment): CompiledQuery {
  return { text: fragment.text, vars: fragment.vars };
}

/** Prepend text to a fragment */
export function prependText(fragment: QueryFragment, prefix: string): QueryFragment {
  return {
    text: prefix + fragment.text,
    vars: fragment.vars,
  };
}

/** Append text to a fragment */
export function appendText(fragment: QueryFragment, suffix: string): QueryFragment {
  return {
    text: fragment.text + suffix,
    vars: fragment.vars,
  };
}
