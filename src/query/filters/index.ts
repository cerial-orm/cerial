/**
 * Filters module barrel export
 */

// Array operators
export { handleIn, handleNotIn } from './array-operators';
// Comparison operators
export { handleEq, handleGt, handleGte, handleLt, handleLte, handleNeq } from './comparison-operators';
// Condition builder
export { buildConditions, buildDirectCondition, buildFieldCondition, isOperatorObject } from './condition-builder';

// Logical operators
export { handleAnd, handleNot, handleOr } from './logical-operators';
// Nested condition builder (for relations)
export {
  buildForwardNestedCondition,
  buildNestedCondition,
  buildReverseNestedCondition,
  isNestedRelationCondition,
} from './nested-condition-builder';
export type { OperatorHandler } from './registry';
// Registry
export { getOperatorHandler, getRegisteredOperators, isRegisteredOperator, registerOperator } from './registry';
// Special operators
export { handleBetween, handleIsDefined, handleIsNotDefined, handleIsNotNull, handleIsNull } from './special-operators';
// String operators
export { handleContains, handleEndsWith, handleStartsWith } from './string-operators';
// Transformer
export { transformWhere, transformWhereClause } from './transformer';
