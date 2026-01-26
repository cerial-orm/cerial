/**
 * Main exports for surreal-om library
 */

import { Surreal } from 'surrealdb';
import { DEFAULT_CONNECTION_NAME } from './connection/connection.const';
import type { IConnectionAuthUserPassOption, IRPCConnectionOption } from './connection/connection.type';

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
  ArrayOperators,
  ASTDecorator,
  ASTField,
  ASTModel,
  ComparisonOperators,
  ConnectionConfig,
  CreateOptions,
  DeleteManyOptions,
  FieldFilter,
  FieldMetadata,
  FieldTypeMapping,
  FindManyOptions,
  FindOneOptions,
  FindOptions,
  Lexeme,
  LexemeType,
  ModelMetadata,
  ModelRegistry,
  NamedConnection,
  OperatorHandler,
  OperatorRegistry,
  OrderByClause,
  OrderDirection,
  ParseError,
  ParseResult,
  QueryResult,
  Result,
  SchemaAST,
  SchemaConstraint,
  SchemaDecorator,
  SchemaFieldType,
  SchemaFile,
  SelectClause,
  SingleResult,
  SourcePosition,
  SourceRange,
  SpecialOperators,
  StringOperators,
  SurrealTypeMapping,
  Token,
  TokenType,
  UpdateOptions,
  WhereClause,
} from './types';

// Export parser (explicit to avoid conflicts)
export {
  astToRegistry,
  createDecorator,
  createField,
  createModel,
  createPosition,
  createRange,
  createSchemaAST,
  fieldToMetadata,
  fileExists,
  filterTokens,
  findSchemaFiles,
  getDecorator,
  getFieldMetadata,
  getFieldNames,
  getFieldsWithDefaults,
  getModel,
  getModelMetadata,
  getModelNames,
  getNowFields,
  getOptionalFields,
  getRequiredFields,
  getUniqueFields,
  hasDecorator,
  hasField,
  hasModel,
  isFieldDeclaration,
  isModelDeclaration,
  isValidFieldType,
  lex,
  loadSchemas,
  modelToMetadata,
  parse,
  parseFieldDeclaration,
  parseFieldType,
  parseWithLexer,
  readSchemaFile,
  readSchemaFiles,
  resolveSchemaPath,
  tokenize,
  validateSchema,
} from './parser';

export type { FindSchemasOptions, LexerResult } from './parser';

// Export generators
export * from './generators';

// Export query (explicit exports to avoid conflicts)
export {
  applyDefaultValues,
  applyNowDefaults,
  buildConditions,
  buildCreateQuery,
  buildDeleteQuery,
  buildDeleteQueryWithReturn,
  buildFindManyQuery,
  buildFindOneQuery,
  buildSelectQuery,
  buildUpdateManyQuery,
  createCompileContext,
  createEmptyQuery,
  createFragment,
  createVarAllocator,
  EMPTY_FRAGMENT,
  executeQuery,
  executeQuerySingle,
  executeRaw,
  executeTransaction,
  filterModelFields,
  formatArray,
  formatObject,
  formatValue,
  fragmentToQuery,
  getOperatorHandler,
  getRegisteredOperators,
  handleAnd,
  handleBetween,
  handleContains,
  handleEndsWith,
  handleEq,
  handleGt,
  handleGte,
  handleIn,
  handleIsDefined,
  handleIsNull,
  handleLt,
  handleLte,
  handleNeq,
  handleNot,
  handleNotIn,
  handleOr,
  handleStartsWith,
  isEmptyFragment,
  isOperatorObject,
  isRegisteredOperator,
  joinFragments,
  mapFieldValue,
  mapRecord,
  mapResult,
  mapSingleResult,
  mergeFragments,
  QueryBuilder,
  QueryBuilderStatic,
  registerOperator,
  transformData,
  transformValue,
  transformWhere,
  transformWhereClause,
  validateCreateData,
  validateUpdateData,
  validateWhere,
  validateWhereClause,
  wrapParens,
} from './query';

export type {
  CompiledQuery,
  DataValidationError,
  DataValidationResult,
  ExecuteOptions,
  QueryFragment,
  QueryVars,
  ValidationError,
  VarBinding,
  WhereValidationResult,
} from './query';

// Export client
export * from './client';

// Export CLI (explicit to avoid conflicts)
export {
  ensureDir,
  ensureDirs,
  ensureParentDir,
  findSchemasInDir,
  generate,
  getDefaultOptions,
  Logger,
  logger,
  parseArgs,
  printHelp,
  resolveSchemas,
  resolveSinglePath,
  validateFieldNames,
  validateModelNames,
  validateOptions,
  writeFile,
  writeFiles,
} from './cli';

export type {
  CLIOptions,
  GenerateResult,
  LoggerOptions,
  LogLevel,
  OptionsValidationError,
  OptionsValidationResult,
  SchemaResolveOptions,
  SchemaValidationError,
  SchemaValidationResult,
  WriteOptions,
} from './cli';

// Export utils
export * from './utils';
