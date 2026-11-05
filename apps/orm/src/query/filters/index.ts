/**
 * Filters module barrel export
 */

// Array operators
// Comparison operators
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
export { getRegisteredOperators, isRegisteredOperator, registerOperator } from './registry';
// Special operators
// String operators
// Transformer
export { transformDestructiveWhere, transformWhere, transformWhereClause } from './transformer';
export {
  handleInChecked as handleIn,
  handleNotInChecked as handleNotIn,
  handleEqChecked as handleEq,
  handleGtChecked as handleGt,
  handleGteChecked as handleGte,
  handleLtChecked as handleLt,
  handleLteChecked as handleLte,
  handleNeqChecked as handleNeq,
  handleBetweenChecked as handleBetween,
  handleIsDefinedChecked as handleIsDefined,
  handleIsNotDefinedChecked as handleIsNotDefined,
  handleIsNotNullChecked as handleIsNotNull,
  handleIsNullChecked as handleIsNull,
  handleContainsChecked as handleContains,
  handleEndsWithChecked as handleEndsWith,
  handleStartsWithChecked as handleStartsWith,
  getOperatorHandlerChecked as getOperatorHandler,
} from './checked';
