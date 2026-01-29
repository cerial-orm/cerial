/**
 * Filters module barrel export
 */

// Comparison operators
export { handleEq, handleGt, handleGte, handleLt, handleLte, handleNeq } from './comparison-operators';

// String operators
export { handleContains, handleEndsWith, handleStartsWith } from './string-operators';

// Array operators
export { handleIn, handleNotIn } from './array-operators';

// Logical operators
export { handleAnd, handleNot, handleOr } from './logical-operators';

// Special operators
export { handleBetween, handleIsDefined, handleIsNull } from './special-operators';

// Registry
export { getOperatorHandler, getRegisteredOperators, isRegisteredOperator, registerOperator } from './registry';
export type { OperatorHandler } from './registry';

// Condition builder
export { buildConditions, buildDirectCondition, buildFieldCondition, isOperatorObject } from './condition-builder';

// Transformer
export { transformWhere, transformWhereClause } from './transformer';

// Nested condition builder (for relations)
export {
  buildForwardNestedCondition,
  buildNestedCondition,
  buildReverseNestedCondition,
  isNestedRelationCondition,
} from './nested-condition-builder';
