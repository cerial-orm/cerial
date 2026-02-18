/**
 * Parser module barrel export
 */

export type { FindSchemasOptions } from './file-reader';
// File reader
export {
  fileExists,
  findSchemaFiles,
  loadSchemas,
  readSchemaFile,
  readSchemaFiles,
  resolveSchemaPath,
} from './file-reader';
export type { LexerResult } from './lexer';
// Lexer
export { lex } from './lexer';
// Model metadata
export {
  astToRegistry,
  fieldToMetadata,
  getFieldMetadata,
  getFieldsWithDefaults,
  getModelMetadata,
  getOptionalFields,
  getRequiredFields,
  getTimestampFields,
  getUniqueFields,
  hasField,
  modelToMetadata,
} from './model-metadata';
// Main parser
export { collectObjectNames, parse, parseWithLexer, validateSchema } from './parser';
// Tokenizer
export { filterTokens, tokenize } from './tokenizer';

// Types and helpers
export {
  createDecorator,
  createField,
  createModel,
  createObject,
  createPosition,
  createRange,
  createSchemaAST,
  getDecorator,
  getFieldNames,
  getModel,
  getModelNames,
  getObject,
  getObjectNames,
  hasDecorator,
  hasModel,
  hasObject,
  isFieldDeclaration,
  isModelDeclaration,
  isValidFieldType,
  parseFieldDeclaration,
  parseFieldType,
} from './types';
