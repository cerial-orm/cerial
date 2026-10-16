/**
 * Main exports for cerial library
 */

import { Surreal } from 'surrealdb';
import { DEFAULT_CONNECTION_NAME } from './connection/connection.const';
import type { IConnectionAuthUserPassOption, IRPCConnectionOption } from './connection/connection.type';
import { CerialConnectionError } from './errors';

/**
 * Cerial - Main connection class
 */
export class Cerial {
  private static instances: Record<string, Cerial> = {};

  private readonly _db = new Surreal();

  private readonly _originalOptions: IRPCConnectionOption;

  private readonly _name: string;
  private readonly _rpcUrl: string;
  private _auth?: IConnectionAuthUserPassOption;
  private _namespace?: string;
  private _database?: string;

  private _isConnected = false;

  // Private so every instance goes through `Cerial.create`: a constructor cannot return the existing instance,
  // and the `_db` initialiser above would already have built a second client by the time a check could run.
  private constructor(options: IRPCConnectionOption & { name: string }) {
    this._originalOptions = options;

    const { name, url, auth, namespace, database } = options;

    this._name = name;
    this._rpcUrl = `${url}/rpc`;
    this._auth = auth;
    this._namespace = namespace;
    this._database = database;
  }

  /**
   * Registers a connection under `options.name` (default `'default'`) and returns it, not yet connected.
   * When the name is taken, `onDuplicateConnection` decides: `use_existing` (default) returns the registered
   * instance and builds nothing, `overwrite` disconnects it and registers a new one, `throw` rejects.
   */
  static async create(options: IRPCConnectionOption): Promise<Cerial> {
    const name = options.name || DEFAULT_CONNECTION_NAME;
    const onDuplicateConnection = options.onDuplicateConnection || 'use_existing';

    const existing = Cerial.instances[name];
    if (existing) {
      if (onDuplicateConnection === 'use_existing') return existing;
      if (onDuplicateConnection === 'throw') throw new CerialConnectionError(`Connection ${name} already exists`);

      // Drop the registry entry only once the old socket is closed, so a failed close leaves a handle to retry.
      await existing.disconnect();
    }

    const instance = new Cerial({ ...options, name, onDuplicateConnection });
    Cerial.instances[name] = instance;

    return instance;
  }

  static getInstance(name: string) {
    const connection = Cerial.instances[name];
    if (!connection) throw new CerialConnectionError(`Connection ${name} not found`);

    return connection;
  }

  static getDb(name: string) {
    return Cerial.getInstance(name).getDB();
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

export { Cerial as C };

export type { RecordIdValue } from 'surrealdb';
// SurrealDB SDK re-exports for typed ID support
export { equals, escapeIdent, escapeIdPart, RecordId, StringRecordId, Table } from 'surrealdb';
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
// Only `defineConfig` stays on the runtime entry; the rest of the CLI is on `cerial/cli`, so the entry never reaches the formatter
export { defineConfig } from './cli/config/define-config';
// Export client (explicit; the model/proxy factories stay internal)
export type {
  BeforeQueryCallback,
  ConnectionManagerOptions,
  DatabaseProxy,
  ModelOptions,
  PerModelCallbacks,
  ProxyOptions,
  TransactionState,
} from './client';
export {
  CerialTransaction,
  ConnectionManager,
  createCerialTransactionProxy,
  createConnectionManager,
  guardUnknownModels,
  Model,
  resetConnectionPool,
} from './client';
// Export errors
export type { CerialErrorCode, CerialErrorOptions } from './errors';
export {
  CERIAL_ERROR_CODES,
  CerialConnectionError,
  CerialDatabaseError,
  CerialError,
  CerialGenerationError,
  CerialMigrationError,
  CerialNotConnectedError,
  CerialTransactionError,
  CerialUniqueConstraintError,
  CerialUnknownFieldError,
  CerialUnknownModelError,
  CerialValidationError,
} from './errors';
export type { FindSchemasOptions, LexerResult } from './parser';
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
  getOptionalFields,
  getRequiredFields,
  getTimestampFields,
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
} from './parser';
export type {
  CerialValidationIssue,
  CompiledQuery,
  CompiledQueryDescriptor,
  DataValidationError,
  DataValidationResult,
  ExecuteOptions,
  QueryFragment,
  QueryResultType,
  QueryVars,
  TransactionArrayItem,
  TransactionExecutionItem,
  TransactionItem,
  VarBinding,
  WhereValidationResult,
} from './query';
// Export query (explicit exports to avoid conflicts)
export {
  applyDefaultValues,
  applyFieldDefaults,
  applyNowDefaults,
  buildConditions,
  buildCreateQuery,
  buildDeleteQuery,
  buildDeleteQueryWithReturn,
  buildFindManyQuery,
  buildFindOneQuery,
  buildSelectQuery,
  buildUpdateManyQuery,
  CerialQueryPromise,
  compileCount,
  compileCreate,
  compileDeleteMany,
  compileDeleteUnique,
  compileExists,
  compileFindMany,
  compileFindOne,
  compileFindUnique,
  compileUpdateMany,
  compileUpdateUnique,
  createCompileContext,
  createEmptyQuery,
  createFragment,
  createVarAllocator,
  EMPTY_FRAGMENT,
  executeClientTransaction,
  executeQuery,
  executeQuerySingle,
  executeRaw,
  executeTransaction,
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
  handleIsNotDefined,
  handleIsNotNull,
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
  isTransactionConflict,
  joinFragments,
  mapFieldValue,
  mapRecord,
  mapResult,
  mapSingleResult,
  mergeFragments,
  QueryBuilder,
  QueryBuilderStatic,
  registerOperator,
  stripComputedFields,
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
// Export types (explicit to avoid conflicts)
export type {
  ArrayOperators,
  ASTDecorator,
  ASTEnum,
  ASTField,
  ASTModel,
  CerialToken,
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
  LiteralFieldMetadata,
  LiteralMetadata,
  LiteralRegistry,
  ModelMetadata,
  ModelRegistry,
  NamedConnection,
  ObjectFieldMetadata,
  ObjectMetadata,
  ObjectRegistry,
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
  SelectClause,
  SingleResult,
  SourcePosition,
  SourceRange,
  SpecialOperators,
  StringOperators,
  SurrealTypeMapping,
  TokenType,
  TransactionCallbackFn,
  TransactionClient,
  TransactionItemResult,
  TransactionOptions,
  TupleElementMetadata,
  TupleFieldMetadata,
  TupleMetadata,
  TupleRegistry,
  UpdateOptions,
  WhereClause,
} from './types';
// Export utils (explicit; the plain array/string/type/validation helpers live on `cerial/utils`)
export type {
  CerialAny,
  CerialBytesInput,
  CerialDecimalInput,
  CerialDurationInput,
  CerialGeometryCollectionInput,
  CerialGeometryInput,
  CerialGeometryType,
  CerialLineStringInput,
  CerialMultiLineStringInput,
  CerialMultiPointInput,
  CerialMultiPolygonInput,
  CerialNone,
  CerialPointInput,
  CerialPolygonInput,
  CerialSet,
  CerialUuidInput,
  RecordIdInput,
} from './utils';
export {
  CerialBytes,
  CerialDecimal,
  CerialDuration,
  CerialGeometry,
  CerialGeometryCollection,
  CerialId,
  CerialLineString,
  CerialMultiLineString,
  CerialMultiPoint,
  CerialMultiPolygon,
  CerialPoint,
  CerialPolygon,
  CerialUuid,
  isCerialBytes,
  isCerialDecimal,
  isCerialDuration,
  isCerialGeometry,
  isCerialId,
  isCerialUuid,
  isNone,
  isRecordIdInput,
  NONE,
} from './utils';
