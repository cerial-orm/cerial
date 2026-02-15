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

// CerialUuid - UUID wrapper
export { CerialUuid, isCerialUuid } from './cerial-uuid';
export type { CerialUuidInput } from './cerial-uuid';

// CerialDuration - Duration wrapper
export { CerialDuration, isCerialDuration } from './cerial-duration';
export type { CerialDurationInput } from './cerial-duration';

// CerialDecimal - Decimal wrapper
export { CerialDecimal, isCerialDecimal } from './cerial-decimal';
export type { CerialDecimalInput } from './cerial-decimal';

// CerialBytes - Bytes wrapper
export { CerialBytes, isCerialBytes } from './cerial-bytes';
export type { CerialBytesInput } from './cerial-bytes';

// CerialGeometry - Geometry class hierarchy
export {
  CerialGeometry,
  CerialPoint,
  CerialLineString,
  CerialPolygon,
  CerialMultiPoint,
  CerialMultiLineString,
  CerialMultiPolygon,
  CerialGeometryCollection,
  isCerialGeometry,
} from './cerial-geometry';
export type {
  CerialGeometryType,
  CerialGeometryInput,
  CerialPointInput,
  CerialLineStringInput,
  CerialPolygonInput,
  CerialMultiPointInput,
  CerialMultiLineStringInput,
  CerialMultiPolygonInput,
  CerialGeometryCollectionInput,
} from './cerial-geometry';

// NONE sentinel
export { NONE, isNone } from './none';
export type { CerialNone } from './none';
