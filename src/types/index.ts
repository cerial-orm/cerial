/**
 * Public types barrel export
 */

// Common types
export type {
  FieldTypeMapping,
  OnDeleteAction,
  Result,
  SchemaConstraint,
  SchemaDecorator,
  SchemaFieldType,
  SourcePosition,
  SourceRange,
  SurrealTypeMapping,
} from './common.types';

// Utility types for inference
export type {
  ArrayResult,
  DefaultArgs,
  GetIncludePayload,
  GetRelationPayload,
  GetResult,
  HasSelectOrInclude,
  IsBooleanInclude,
  NullableResult,
  RelationDef,
  SelectSubset,
  TrueKeys,
} from './utility.types';

// Metadata types
export type {
  ConnectionConfig,
  FieldMetadata,
  ModelMetadata,
  ModelRegistry,
  NamedConnection,
  ObjectFieldMetadata,
  ObjectMetadata,
  ObjectRegistry,
  RelationFieldMetadata,
} from './metadata.types';

// Parser types
export type {
  ASTDecorator,
  ASTField,
  ASTModel,
  ASTObject,
  Lexeme,
  LexemeType,
  ParseError,
  ParseResult,
  SchemaAST,
  SchemaFile,
  Token,
  TokenType,
} from './parser.types';

// Query types
export type {
  ArrayOperators,
  ComparisonOperators,
  CompiledQuery,
  CreateOptions,
  DeleteManyOptions,
  DeleteUniqueOptions,
  DeleteUniqueResult,
  DeleteUniqueReturn,
  FieldFilter,
  FilterCompileContext,
  FindManyOptions,
  FindOneOptions,
  FindOptions,
  FindUniqueOptions,
  OperatorHandler,
  OperatorRegistry,
  OrderByClause,
  OrderDirection,
  QueryFragment,
  QueryResult,
  QueryVars,
  SelectClause,
  SingleResult,
  SpecialOperators,
  StringOperators,
  UpdateOptions,
  UpdateUniqueResult,
  UpdateUniqueReturn,
  VarBinding,
  WhereClause,
} from './query.types';
