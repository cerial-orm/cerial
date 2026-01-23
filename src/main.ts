/**
 * Main exports for surreal-om library
 */

import { Surreal } from 'surrealdb';
import type { IConnectionAuthUserPassOption, IRPCConnectionOption } from './connection/connection.type';
import { DEFAULT_CONNECTION_NAME } from './connection/connection.const';

/**
 * SurrealOM - Main connection class
 */
export class SurrealOM {
  private static instances: Record<string, SurrealOM> = {};

  private _db = new Surreal();

  private readonly _originalOptions: IRPCConnectionOption;

  private readonly _name: string;
  private readonly _rpcUrl: string;
  private _auth?: IConnectionAuthUserPassOption;
  private _namespace?: string;
  private _database?: string;

  private _isConnected = false;

  constructor(options: IRPCConnectionOption) {
    options.name = options.name || DEFAULT_CONNECTION_NAME;
    options.onDuplicateConnection = options.onDuplicateConnection || 'use_existing';

    this._originalOptions = options;

    const { name, url, auth, namespace, database, onDuplicateConnection } = options;

    this._name = name;
    this._rpcUrl = `${url}/rpc`;
    this._auth = auth;
    this._namespace = namespace;
    this._database = database;

    if (SurrealOM.instances[name]) {
      if (onDuplicateConnection === 'use_existing') return SurrealOM.instances[name]!;
      if (onDuplicateConnection === 'overwrite') delete SurrealOM.instances[name];
      if (onDuplicateConnection === 'throw') throw new Error(`Connection ${name} already exists`);
    }

    SurrealOM.instances[options.name] = this;
  }

  static getInstance(name: string) {
    const connection = SurrealOM.instances[name];
    if (!connection) throw new Error(`Connection ${name} not found`);

    return connection;
  }

  static getDb(name: string) {
    return SurrealOM.getInstance(name).getDB();
  }

  isConnected() {
    return this._isConnected;
  }

  getConnectedOptions() {
    return this._originalOptions;
  }

  getConnectionName() {
    return this._name;
  }

  getAuth() {
    return this._auth;
  }

  getNamespace() {
    return this._namespace;
  }

  getDatabase() {
    return this._database;
  }

  getDB() {
    return this._db;
  }

  async connect() {
    if (this._isConnected) return this;

    await this._dbConnect();
    this._isConnected = true;

    return this;
  }

  async disconnect() {
    if (!this._isConnected) return this;

    await this._db.close();
    this._isConnected = false;

    return this;
  }

  private async _dbConnect() {
    await this._db.connect(this._rpcUrl);
    await this._dbLogin();
  }

  private async _dbLogin() {
    if (this._auth) await this._db.signin({ username: this._auth.user, password: this._auth.password });

    if (this._namespace) await this._db.use({ namespace: this._namespace });
    if (this._database) await this._db.use({ database: this._database });
  }
}

export { SurrealOM as S };

// Export types (explicit to avoid conflicts)
export type {
  SchemaFieldType,
  SchemaDecorator,
  SchemaConstraint,
  FieldTypeMapping,
  SurrealTypeMapping,
  Result,
  SourcePosition,
  SourceRange,
  FieldMetadata,
  ModelMetadata,
  ModelRegistry,
  ConnectionConfig,
  NamedConnection,
  TokenType,
  Token,
  LexemeType,
  Lexeme,
  ASTDecorator,
  ASTField,
  ASTModel,
  SchemaAST,
  ParseResult,
  ParseError,
  SchemaFile,
  ComparisonOperators,
  StringOperators,
  ArrayOperators,
  SpecialOperators,
  FieldFilter,
  WhereClause,
  SelectClause,
  OrderDirection,
  OrderByClause,
  FindOptions,
  FindOneOptions,
  FindManyOptions,
  CreateOptions,
  UpdateOptions,
  DeleteOptions,
  QueryResult,
  SingleResult,
  OperatorHandler,
  OperatorRegistry,
} from './types';

// Export parser (explicit to avoid conflicts)
export {
  parse,
  parseWithLexer,
  validateSchema,
  tokenize,
  filterTokens,
  lex,
  findSchemaFiles,
  readSchemaFile,
  readSchemaFiles,
  loadSchemas,
  fileExists,
  resolveSchemaPath,
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
} from './parser';

export type { LexerResult, FindSchemasOptions } from './parser';

// Export generators
export * from './generators';

// Export query (explicit exports to avoid conflicts)
export {
  EMPTY_FRAGMENT,
  createEmptyQuery,
  isEmptyFragment,
  createVarAllocator,
  createCompileContext,
  createFragment,
  mergeFragments,
  joinFragments,
  wrapParens,
  fragmentToQuery,
  handleEq,
  handleNeq,
  handleGt,
  handleGte,
  handleLt,
  handleLte,
  handleContains,
  handleStartsWith,
  handleEndsWith,
  handleIn,
  handleNotIn,
  handleAnd,
  handleOr,
  handleNot,
  handleIsNull,
  handleIsDefined,
  handleBetween,
  getOperatorHandler,
  isRegisteredOperator,
  getRegisteredOperators,
  registerOperator,
  buildConditions,
  isOperatorObject,
  transformWhere,
  transformWhereClause,
  buildSelectQuery,
  buildFindOneQuery,
  buildFindManyQuery,
  buildInsertQuery,
  buildCreateQuery,
  buildUpdateQuery,
  buildMergeQuery,
  buildDeleteQuery,
  buildDeleteQueryWithReturn,
  applyNowDefaults,
  applyDefaultValues,
  transformValue,
  transformData,
  filterModelFields,
  formatValue,
  formatArray,
  formatObject,
  mapFieldValue,
  mapRecord,
  filterFields,
  mapResult,
  mapSingleResult,
  validateWhere,
  validateWhereClause,
  validateCreateData,
  validateUpdateData,
  executeQuery,
  executeQuerySingle,
  executeTransaction,
  executeRaw,
  QueryBuilder,
  QueryBuilderStatic,
} from './query';

export type {
  CompiledQuery,
  QueryVars,
  QueryFragment,
  VarBinding,
  ValidationError,
  WhereValidationResult,
  DataValidationError,
  DataValidationResult,
  ExecuteOptions,
} from './query';

// Export client
export * from './client';

// Export CLI (explicit to avoid conflicts)
export {
  resolveSchemas,
  resolveSinglePath,
  findSchemasInDir,
  ensureDir,
  ensureParentDir,
  ensureDirs,
  writeFile,
  writeFiles,
  Logger,
  logger,
  validateOptions,
  getDefaultOptions,
  validateModelNames,
  validateFieldNames,
  parseArgs,
  printHelp,
  generate,
} from './cli';

export type {
  SchemaResolveOptions,
  WriteOptions,
  LogLevel,
  LoggerOptions,
  CLIOptions,
  OptionsValidationError,
  OptionsValidationResult,
  SchemaValidationError,
  SchemaValidationResult,
  GenerateResult,
} from './cli';

// Export utils
export * from './utils';
