/**
 * Query module barrel export
 */

// Compile primitives
export type { QueryVars, QueryFragment, CompiledQuery, VarBinding } from './compile';
export {
  EMPTY_FRAGMENT,
  createEmptyQuery,
  isEmptyFragment,
  createVarAllocator,
  createCompileContext,
  createFragment,
  mergeFragments,
  joinFragments,
  wrapParens,
  fragmentToQuery,
} from './compile';

// Filters
export {
  // Comparison operators
  handleEq,
  handleNeq,
  handleGt,
  handleGte,
  handleLt,
  handleLte,
  // String operators
  handleContains,
  handleStartsWith,
  handleEndsWith,
  // Array operators
  handleIn,
  handleNotIn,
  // Logical operators
  handleAnd,
  handleOr,
  handleNot,
  // Special operators
  handleIsNull,
  handleIsDefined,
  handleBetween,
  // Registry
  getOperatorHandler,
  isRegisteredOperator,
  getRegisteredOperators,
  registerOperator,
  // Condition builder
  buildConditions,
  isOperatorObject,
  // Transformer
  transformWhere,
  transformWhereClause,
} from './filters';

// Builders
export {
  buildSelectQuery,
  buildFindOneQuery,
  buildFindManyQuery,
  buildInsertQuery,
  buildCreateQuery,
  buildUpdateQuery,
  buildMergeQuery,
  buildDeleteQuery,
  buildDeleteQueryWithReturn,
  applyNowDefaults,
  applyDefaultValues,
} from './builders';

// Transformers
export {
  transformValue,
  transformData,
  filterModelFields,
  formatValue,
  formatArray,
  formatObject,
} from './transformers';

// Mappers
export {
  mapFieldValue,
  mapRecord,
  filterFields,
  mapResult,
  mapSingleResult,
} from './mappers';

// Validators
export {
  validateWhere,
  validateWhereClause,
  validateCreateData,
  validateUpdateData,
} from './validators';
export type {
  ValidationError,
  WhereValidationResult,
  DataValidationError,
  DataValidationResult,
} from './validators';

// Executor
export {
  executeQuery,
  executeQuerySingle,
  executeTransaction,
  executeRaw,
} from './executor';
export type { ExecuteOptions } from './executor';

// Builder
export { QueryBuilder, QueryBuilderStatic } from './builder';
