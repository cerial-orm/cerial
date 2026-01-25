/**
 * Query module barrel export
 */

// Compile primitives
export {
  createCompileContext,
  createEmptyQuery,
  createFragment,
  createVarAllocator,
  EMPTY_FRAGMENT,
  fragmentToQuery,
  isEmptyFragment,
  joinFragments,
  mergeFragments,
  wrapParens,
} from './compile';
export type { CompiledQuery, QueryFragment, QueryVars, VarBinding } from './compile';

// Filters
export {
  // Condition builder
  buildConditions,
  // Registry
  getOperatorHandler,
  getRegisteredOperators,
  // Logical operators
  handleAnd,
  handleBetween,
  // String operators
  handleContains,
  handleEndsWith,
  // Comparison operators
  handleEq,
  handleGt,
  handleGte,
  // Array operators
  handleIn,
  handleIsDefined,
  // Special operators
  handleIsNull,
  handleLt,
  handleLte,
  handleNeq,
  handleNot,
  handleNotIn,
  handleOr,
  handleStartsWith,
  isOperatorObject,
  isRegisteredOperator,
  registerOperator,
  // Transformer
  transformWhere,
  transformWhereClause,
} from './filters';

// Builders
export {
  applyDefaultValues,
  applyNowDefaults,
  buildCreateQuery,
  buildDeleteQuery,
  buildDeleteQueryWithReturn,
  buildFindManyQuery,
  buildFindOneQuery,
  buildSelectQuery,
  buildUpdateManyQuery,
} from './builders';

// Transformers
export {
  filterModelFields,
  formatArray,
  formatObject,
  formatValue,
  transformData,
  transformValue,
} from './transformers';

// Mappers
export { mapFieldValue, mapRecord, mapResult, mapSingleResult } from './mappers';

// Validators
export { validateCreateData, validateUpdateData, validateWhere, validateWhereClause } from './validators';
export type { DataValidationError, DataValidationResult, ValidationError, WhereValidationResult } from './validators';

// Executor
export { executeQuery, executeQuerySingle, executeRaw, executeTransaction } from './executor';
export type { ExecuteOptions } from './executor';

// Builder
export { QueryBuilder, QueryBuilderStatic } from './builder';
