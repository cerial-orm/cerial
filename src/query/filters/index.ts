/**
 * Filters module barrel export
 */

// Comparison operators
export {
  handleEq,
  handleNeq,
  handleGt,
  handleGte,
  handleLt,
  handleLte,
} from './comparison-operators';

// String operators
export {
  handleContains,
  handleStartsWith,
  handleEndsWith,
} from './string-operators';

// Array operators
export { handleIn, handleNotIn } from './array-operators';

// Logical operators
export { handleAnd, handleOr, handleNot } from './logical-operators';

// Special operators
export { handleIsNull, handleIsDefined, handleBetween } from './special-operators';

// Registry
export {
  getOperatorHandler,
  isRegisteredOperator,
  getRegisteredOperators,
  registerOperator,
} from './registry';
export type { OperatorHandler } from './registry';

// Condition builder
export {
  buildFieldCondition,
  buildDirectCondition,
  isOperatorObject,
  buildConditions,
} from './condition-builder';

// Transformer
export { transformWhere, transformWhereClause } from './transformer';
