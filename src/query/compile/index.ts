/**
 * Compile module barrel export
 */

export type { QueryVars, QueryFragment, CompiledQuery, VarBinding } from './types';
export { EMPTY_FRAGMENT, createEmptyQuery, isEmptyFragment } from './types';

export type { VarAllocator, FilterCompileContext } from './var-allocator';
export { createVarAllocator, generateVarName, bindVar, createCompileContext } from './var-allocator';

export {
  createFragment,
  mergeFragments,
  joinFragments,
  wrapParens,
  fragmentToQuery,
  prependText,
  appendText,
} from './fragment';
