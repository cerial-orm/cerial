/**
 * Parameterized query compilation types
 */

/** Variable bindings for parameterized queries */
export interface QueryVars {
  [key: string]: unknown;
}

/** Query fragment - partial query with its variables */
export interface QueryFragment {
  text: string;
  vars: QueryVars;
}

/** Compiled query ready for execution */
export interface CompiledQuery {
  /** The query text with placeholders */
  text: string;
  /** The variable bindings */
  vars: QueryVars;
}

/** Variable binding result */
export interface VarBinding {
  /** The placeholder name (e.g., $user_age_eq) */
  placeholder: string;
  /** The variables map with this binding */
  vars: QueryVars;
}

/** Empty fragment */
export const EMPTY_FRAGMENT: QueryFragment = { text: '', vars: {} };

/** Create an empty compiled query */
export function createEmptyQuery(): CompiledQuery {
  return { text: '', vars: {} };
}

/** Check if a fragment is empty */
export function isEmptyFragment(fragment: QueryFragment): boolean {
  return fragment.text === '' && Object.keys(fragment.vars).length === 0;
}
