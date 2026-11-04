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

/** One record a nested `connect` or `set` links to; its place in `TargetCheckMap.entries` is the guard's position */
export interface TargetCheckEntry {
  field: string;
  verb: 'connect' | 'set';
  targetModel: string;
  id: string;
}

/**
 * Where a guarded nested write returns the position of its first missing target. `at` is the index of
 * that value in the results of `text` as compiled; an executor that strips the BEGIN reads `at - 1`.
 */
export interface TargetCheckMap {
  at: number;
  model: string;
  operation: string;
  entries: readonly TargetCheckEntry[];
}

/** Compiled query ready for execution */
export interface CompiledQuery {
  /** The query text with placeholders */
  text: string;
  /** The variable bindings */
  vars: QueryVars;
  /** Present when the text guards a nested write on its connect and set targets existing */
  targetCheck?: TargetCheckMap;
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
