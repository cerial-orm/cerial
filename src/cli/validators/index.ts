/**
 * Validators barrel export
 */

export {
  validateNullableDecorator,
  validateNullableOnObjectFields,
  validateNullableOnTupleElements,
  validateTupleElementDecorators,
} from './nullable-validator';
export type { CLIOptions, LogOutputLevel, OptionsValidationError, OptionsValidationResult } from './options-validator';
export { getDefaultOptions, validateOptions } from './options-validator';
export { validateRecordIdTypes } from './record-type-validator';
export {
  validateCardinalityMatch,
  validateKeyPairing,
  validateKeyRequired,
  validateNonPKSide,
  validateOnDeletePlacement,
  validatePKStructure,
  validateRecordDecorators,
  validateRelationRules,
  validateSingleSidedOptional,
} from './relation-validator';
export type { SchemaValidationError, SchemaValidationResult } from './schema-validator';
export { validateFieldNames, validateModelNames, validateSchema, validateUuidFields } from './schema-validator';
