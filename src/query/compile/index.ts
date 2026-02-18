/**
 * Compile module barrel export
 */

export {
  appendText,
  createFragment,
  fragmentToQuery,
  joinFragments,
  mergeFragments,
  prependText,
  wrapParens,
} from './fragment';
export type { CompiledQuery, QueryFragment, QueryVars, VarBinding } from './types';
export { createEmptyQuery, EMPTY_FRAGMENT, isEmptyFragment } from './types';
export type { FilterCompileContext, VarAllocator } from './var-allocator';
export { bindVar, createCompileContext, createVarAllocator, generateVarName } from './var-allocator';
