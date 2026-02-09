/**
 * Utilities barrel export
 */

// String utilities
export {
  toSnakeCase,
  toCamelCase,
  toPascalCase,
  escapeRegex,
  escapeString,
  isValidIdentifier,
  capitalize,
  uncapitalize,
  normalizeWhitespace,
  removeComments,
  indent,
} from './string-utils';

// Type utilities
export {
  isString,
  isNumber,
  isBoolean,
  isDate,
  isNullish,
  isObject,
  isArray,
  getSchemaFieldType,
  schemaTypeToTsType,
  schemaTypeToSurrealType,
  isPrimitiveType,
} from './type-utils';

// Validation utilities
export {
  isValidEmail,
  validateFieldType,
  isValidModelName,
  isValidFieldName,
  isComparisonOperator,
  isStringOperator,
  isArrayOperator,
  isSpecialOperator,
  isLogicalOperator,
  isNotEmpty,
  validResult,
  invalidResult,
} from './validation-utils';
export type { ValidationResult } from './validation-utils';

// Array utilities
export {
  isEmpty,
  isNotEmpty as isArrayNotEmpty,
  first,
  last,
  unique,
  uniqueBy,
  flatten,
  groupBy,
  partition,
  chunk,
  findIndex,
  zip,
} from './array-utils';

// CerialId - Record ID wrapper
export { CerialId, isCerialId } from './cerial-id';
export type { RecordIdInput } from './cerial-id';
