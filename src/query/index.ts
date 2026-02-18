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
export type { QueryResultType } from './cerial-query-promise';
// CerialQueryPromise
export { CerialQueryPromise } from './cerial-query-promise';
export type { CompiledQuery, QueryFragment, QueryVars, VarBinding } from './compile';
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
export type { ExecuteOptions, TransactionItem } from './executor';

// Executor
export { executeClientTransaction, executeQuery, executeQuerySingle, executeRaw, executeTransaction } from './executor';
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
export { mapFieldValue, mapRecord, mapResult, mapSingleResult } from './mappers';
// Transformers
export {
  applyFieldDefaults,
  applyNowDefaults,
  filterModelFields,
  formatArray,
  formatObject,
  formatValue,
  transformData,
  transformValue,
} from './transformers';
export type { DataValidationError, DataValidationResult, ValidationError, WhereValidationResult } from './validators';
// Validators
export { validateCreateData, validateUpdateData, validateWhere, validateWhereClause } from './validators';
