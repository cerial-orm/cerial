/**
 * Type checks for common types
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { Test } from 'ts-toolbelt';
import type {
  Token,
  TokenType,
  SourcePosition,
  SourceRange,
  ASTDecorator,
  ASTField,
  ASTModel,
  SchemaAST,
  OnDeleteAction,
  SchemaFieldType,
  SchemaDecorator,
} from '../../../src/types';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// SourcePosition
// =============================================================================

Test.checks([
  Test.check<SourcePosition['line'], number, Test.Pass>(),
  Test.check<SourcePosition['column'], number, Test.Pass>(),
  Test.check<SourcePosition['offset'], number, Test.Pass>(),
]);

// =============================================================================
// SourceRange
// =============================================================================

Test.checks([
  Test.check<SourceRange['start'], SourcePosition, Test.Pass>(),
  Test.check<SourceRange['end'], SourcePosition, Test.Pass>(),
]);

// =============================================================================
// TokenType
// =============================================================================

type ExpectedTokenTypes =
  | 'keyword'
  | 'identifier'
  | 'type'
  | 'decorator'
  | 'punctuation'
  | 'string'
  | 'number'
  | 'boolean'
  | 'whitespace'
  | 'newline'
  | 'comment'
  | 'eof';

Test.checks([Test.check<TokenType, ExpectedTokenTypes, Test.Pass>()]);

// =============================================================================
// Token
// =============================================================================

Test.checks([
  Test.check<Token['type'], TokenType, Test.Pass>(),
  Test.check<Token['value'], string, Test.Pass>(),
  Test.check<Token['position'], SourcePosition, Test.Pass>(),
]);

// =============================================================================
// ASTDecorator
// =============================================================================

Test.checks([
  Test.check<ASTDecorator['type'], SchemaDecorator, Test.Pass>(),
  Test.check<ASTDecorator['range'], SourceRange, Test.Pass>(),
  Test.check<ASTDecorator['value'], unknown, Test.Pass>(),
]);

// =============================================================================
// ASTField
// =============================================================================

Test.checks([
  Test.check<ASTField['name'], string, Test.Pass>(),
  Test.check<ASTField['type'], SchemaFieldType, Test.Pass>(),
  Test.check<ASTField['isOptional'], boolean, Test.Pass>(),
  Test.check<ASTField['isArray'], boolean | undefined, Test.Pass>(),
  Test.check<ASTField['decorators'], ASTDecorator[], Test.Pass>(),
  Test.check<ASTField['range'], SourceRange, Test.Pass>(),
]);

// =============================================================================
// ASTModel
// =============================================================================

Test.checks([
  Test.check<ASTModel['name'], string, Test.Pass>(),
  Test.check<ASTModel['fields'], ASTField[], Test.Pass>(),
  Test.check<ASTModel['range'], SourceRange, Test.Pass>(),
]);

// =============================================================================
// SchemaAST
// =============================================================================

Test.checks([Test.check<SchemaAST['models'], ASTModel[], Test.Pass>()]);

// =============================================================================
// OnDeleteAction
// =============================================================================

type ExpectedOnDeleteActions = 'Cascade' | 'SetNull' | 'Restrict' | 'NoAction';

Test.checks([Test.check<OnDeleteAction, ExpectedOnDeleteActions, Test.Pass>()]);

// =============================================================================
// SchemaFieldType
// =============================================================================

type ExpectedFieldTypes = 'string' | 'email' | 'int' | 'float' | 'bool' | 'date' | 'record' | 'relation';

Test.checks([Test.check<SchemaFieldType, ExpectedFieldTypes, Test.Pass>()]);
