/**
 * Validators barrel export
 */

export {
  validateFieldNames,
  validateModelNames,
  validateSchema,
} from './schema-validator';
export type { SchemaValidationError, SchemaValidationResult } from './schema-validator';

export { getDefaultOptions, validateOptions } from './options-validator';
export type { CLIOptions, OptionsValidationError, OptionsValidationResult } from './options-validator';

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
