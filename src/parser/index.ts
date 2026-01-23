/**
 * Parser module barrel export
 */

// Main parser
export { parse, parseWithLexer, validateSchema } from './parser';

// Tokenizer
export { tokenize, filterTokens } from './tokenizer';

// Lexer
export { lex } from './lexer';
export type { LexerResult } from './lexer';

// File reader
export {
  findSchemaFiles,
  readSchemaFile,
  readSchemaFiles,
  loadSchemas,
  fileExists,
  resolveSchemaPath,
} from './file-reader';
export type { FindSchemasOptions } from './file-reader';

// Model metadata
export {
  fieldToMetadata,
  modelToMetadata,
  astToRegistry,
  getModelMetadata,
  getFieldMetadata,
  hasField,
  getUniqueFields,
  getRequiredFields,
  getOptionalFields,
  getNowFields,
  getFieldsWithDefaults,
} from './model-metadata';

// Types and helpers
export {
  createPosition,
  createRange,
  createDecorator,
  createField,
  createModel,
  createSchemaAST,
  hasModel,
  getModel,
  hasDecorator,
  getDecorator,
  getFieldNames,
  getModelNames,
  parseFieldType,
  isValidFieldType,
  parseFieldDeclaration,
  isModelDeclaration,
  isFieldDeclaration,
} from './types';
