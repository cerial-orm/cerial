/**
 * Utilities barrel export
 */

// Array utilities
export {
  chunk,
  findIndex,
  first,
  flatten,
  groupBy,
  isEmpty,
  isNotEmpty as isArrayNotEmpty,
  last,
  partition,
  unique,
  uniqueBy,
  zip,
} from './array-utils';
// CerialAny - Recursive any type
export type { CerialAny } from './cerial-any';
export type { CerialBytesInput } from './cerial-bytes';
// CerialBytes - Bytes wrapper
export { CerialBytes, isCerialBytes } from './cerial-bytes';
export type { CerialDecimalInput } from './cerial-decimal';
// CerialDecimal - Decimal wrapper
export { CerialDecimal, isCerialDecimal } from './cerial-decimal';
export type { CerialDurationInput } from './cerial-duration';
// CerialDuration - Duration wrapper
export { CerialDuration, isCerialDuration } from './cerial-duration';
export type {
  CerialGeometryCollectionInput,
  CerialGeometryInput,
  CerialGeometryType,
  CerialLineStringInput,
  CerialMultiLineStringInput,
  CerialMultiPointInput,
  CerialMultiPolygonInput,
  CerialPointInput,
  CerialPolygonInput,
} from './cerial-geometry';
// CerialGeometry - Geometry class hierarchy
export {
  CerialGeometry,
  CerialGeometryCollection,
  CerialLineString,
  CerialMultiLineString,
  CerialMultiPoint,
  CerialMultiPolygon,
  CerialPoint,
  CerialPolygon,
  isCerialGeometry,
} from './cerial-geometry';
export type { RecordIdInput } from './cerial-id';
// CerialId - Record ID wrapper
export { CerialId, isCerialId, isRecordIdInput } from './cerial-id';
// CerialSet - Branded set type
export type { CerialSet } from './cerial-set';
export type { CerialUuidInput } from './cerial-uuid';
// CerialUuid - UUID wrapper
export { CerialUuid, isCerialUuid } from './cerial-uuid';
export type { CerialNone } from './none';
// NONE sentinel
export { isNone, NONE } from './none';
// String utilities
export {
  capitalize,
  escapeRegex,
  escapeString,
  indent,
  isValidIdentifier,
  normalizeWhitespace,
  removeComments,
  toCamelCase,
  toPascalCase,
  toSnakeCase,
  uncapitalize,
} from './string-utils';
// Type utilities
export {
  getSchemaFieldType,
  isArray,
  isBoolean,
  isDate,
  isNullish,
  isNumber,
  isObject,
  isPrimitiveType,
  isString,
  schemaTypeToSurrealType,
  schemaTypeToTsType,
} from './type-utils';
export type { ValidationResult } from './validation-utils';
// Validation utilities
export {
  invalidResult,
  isArrayOperator,
  isComparisonOperator,
  isLogicalOperator,
  isNotEmpty,
  isSpecialOperator,
  isStringOperator,
  isValidEmail,
  isValidFieldName,
  isValidModelName,
  validateFieldType,
  validateTypedRecordId,
  validResult,
} from './validation-utils';
