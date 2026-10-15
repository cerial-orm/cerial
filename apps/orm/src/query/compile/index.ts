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
export type { InlineExpression } from './inline-expression';
export { bindWithInlineExpressions, containsInlineExpression, isInlineExpression, TIME_NOW } from './inline-expression';
export type { CompiledQuery, QueryFragment, QueryVars, VarBinding } from './types';
export { createEmptyQuery, EMPTY_FRAGMENT, isEmptyFragment } from './types';
export type { FilterCompileContext, VarAllocator } from './var-allocator';
export { bindVar, createCompileContext, createVarAllocator, generateVarName } from './var-allocator';
