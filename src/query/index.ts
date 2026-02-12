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
  buildCreateQuery,
  stripComputedFields,
  buildDeleteQuery,
  buildDeleteQueryWithReturn,
  buildFindManyQuery,
  buildFindOneQuery,
  buildSelectQuery,
  buildUpdateManyQuery,
} from './builders';

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

// Mappers
export { mapFieldValue, mapRecord, mapResult, mapSingleResult } from './mappers';

// Validators
export { validateCreateData, validateUpdateData, validateWhere, validateWhereClause } from './validators';
export type { DataValidationError, DataValidationResult, ValidationError, WhereValidationResult } from './validators';

// Executor
export { executeQuery, executeQuerySingle, executeRaw, executeTransaction, executeClientTransaction } from './executor';
export type { ExecuteOptions, TransactionItem } from './executor';

// CerialQueryPromise
export { CerialQueryPromise } from './cerial-query-promise';
export type { QueryResultType } from './cerial-query-promise';

// Builder
export {
  QueryBuilder,
  QueryBuilderStatic,
  compileFindOne,
  compileFindMany,
  compileFindUnique,
  compileCreate,
  compileUpdateMany,
  compileUpdateUnique,
  compileDeleteMany,
  compileDeleteUnique,
  compileCount,
  compileExists,
} from './builder';
export type { CompiledQueryDescriptor } from './builder';
