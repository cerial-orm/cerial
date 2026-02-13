/**
 * Parser types barrel export
 */

// AST helpers
export {
  createPosition,
  createRange,
  createDecorator,
  createCompositeDirective,
  createField,
  createModel,
  createObject,
  createTuple,
  createTupleElement,
  createSchemaAST,
  hasModel,
  getModel,
  hasDecorator,
  getDecorator,
  getFieldNames,
  getModelNames,
  hasObject,
  getObject,
  getObjectNames,
  hasTuple,
  getTuple,
  getTupleNames,
} from './ast';

// Field decorators
export {
  isIdDecorator,
  parseIdDecorator,
  isUniqueDecorator,
  parseUniqueDecorator,
  isNowDecorator,
  parseNowDecorator,
  isDefaultDecorator,
  extractDefaultValue,
  parseDefaultDecorator,
} from './field-decorators';

// Field types
export {
  isStringType,
  getStringFieldType,
  isEmailType,
  getEmailFieldType,
  isIntType,
  getIntFieldType,
  isDateType,
  getDateFieldType,
  isBoolType,
  getBoolFieldType,
  isFloatType,
  getFloatFieldType,
  parseFieldType,
  isValidFieldType,
  isObjectType,
  extractObjectName,
  isTupleType,
  extractTupleName,
  isArrayType,
} from './field-types';

// Field constraints
export {
  isRequiredField,
  parseRequiredConstraint,
  isOptionalField,
  parseOptionalConstraint,
} from './field-constraints';

// Model parsing
export {
  isModelDeclaration,
  extractModelName,
  modelNameToTableName,
  parseModelDeclaration,
  isFieldDeclaration,
  parseDecorators,
  parseFieldDeclaration,
  extractFieldName,
  extractFieldType,
  hasOptionalMarker,
} from './model';
export type { FieldParseResult } from './model';
