/**
 * Query module barrel export
 */

export type { CompiledQueryDescriptor } from './builder';
// Builder
export {
  compileCount,
  compileCreate,
  compileDeleteMany,
  compileDeleteUnique,
  compileExists,
  compileFindMany,
  compileFindOne,
  compileFindUnique,
  compileUpdateMany,
  compileUpdateUnique,
  QueryBuilder,
  QueryBuilderStatic,
} from './builder';
// Builders
export {
  applyDefaultValues,
  buildCreateQuery,
  buildDeleteQuery,
  buildDeleteQueryWithReturn,
  buildFindManyQuery,
  buildFindOneQuery,
  buildSelectQuery,
  buildUpdateManyQuery,
  stripComputedFields,
} from './builders';
export type { QueryResultType, TransactionArrayItem } from './cerial-query-promise';
// CerialQueryPromise
export { CerialQueryPromise } from './cerial-query-promise';
export type { CompiledQuery, QueryFragment, QueryVars, SqlFragment, VarBinding } from './compile';
// Compile primitives
export {
  compileFragment,
  createCompileContext,
  createEmptyQuery,
  createFragment,
  createVarAllocator,
  EMPTY_FRAGMENT,
  fragmentToQuery,
  isEmptyFragment,
  isSqlFragment,
  joinFragments,
  mergeFragments,
  sql,
  wrapParens,
} from './compile';
export type { ExecuteOptions, TransactionExecutionItem, TransactionItem } from './executor';

// Executor
export {
  executeClientTransaction,
  executeClientTransactionLegacy,
  executeQuery,
  executeQuerySingle,
  executeRaw,
  executeTransaction,
  isTransactionConflict,
} from './executor';
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
  handleIsNotDefined,
  // Special operators
  handleIsNotNull,
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
// Mappers
export { mapFieldValue, mapRawResult, mapRecord, mapResult, mapSingleResult } from './mappers';
export { compileRawStatement, executeRawStatement } from './raw-statement';
// Transformers
export {
  applyFieldDefaults,
  applyNowDefaults,
  formatArray,
  formatObject,
  formatValue,
  transformData,
  transformValue,
} from './transformers';
export type {
  CerialValidationIssue,
  DataValidationError,
  DataValidationResult,
  WhereValidationResult,
} from './validators';
// Validators
export { validateCreateData, validateUpdateData, validateWhere, validateWhereClause } from './validators';
