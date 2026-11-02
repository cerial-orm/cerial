import { CerialError, type CerialErrorOptions } from './cerial-error';
import { CERIAL_ERROR_CODES } from './codes';
import type { MigrationPlan } from '../migrations/plan';

/** The generated statement and its bound values, carried only when the client sets `includeStatementInErrors`. */
export interface CerialStatement {
  readonly text: string;
  readonly vars: Readonly<Record<string, unknown>>;
}

/** Which constraint a write violated: a unique index, or the primary key of a record that already exists. */
export type CerialUniqueConflict = 'index' | 'record';

/** What a unique-constraint error carries beyond the common context. */
export interface CerialUniqueConstraintErrorOptions extends CerialErrorOptions {
  /** Which constraint was violated. Defaults to `'index'`. */
  readonly conflict?: CerialUniqueConflict;
  /** The name of the unique index the write violated. Index conflicts only. */
  readonly index?: string;
  /** The conflicting value as the database rendered it (a SurrealQL literal: `'a@b.c'`, `5`, `['a', 1]`). Index conflicts only. */
  readonly value?: string;
  /** The id of the record involved: the one that already holds the value, or the one that already exists. */
  readonly record?: string;
  readonly statement?: CerialStatement;
}

/**
 * A write tried to create something that already exists. One class for one recovery (supply different
 * input), with `conflict` saying which constraint: `'index'` (a unique index holds the value, so
 * `index` and `value` are set) or `'record'` (the record id is taken). `record` is set for both.
 * Wraps the database error as `cause`.
 */
export class CerialUniqueConstraintError extends CerialError {
  readonly conflict: CerialUniqueConflict;
  readonly index?: string;
  readonly value?: string;
  readonly record?: string;
  /** Absent unless the client opted in with `includeStatementInErrors`, because the values are user data. */
  readonly statement?: CerialStatement;

  constructor(message: string, options: CerialUniqueConstraintErrorOptions = {}) {
    super(CERIAL_ERROR_CODES.UNIQUE_CONSTRAINT, message, options);
    this.name = 'CerialUniqueConstraintError';
    this.conflict = options.conflict ?? 'index';
    this.index = options.index;
    this.value = options.value;
    this.record = options.record;
    this.statement = options.statement;
  }
}

/** What a migration error carries beyond the common context. */
export interface CerialMigrationErrorOptions extends CerialErrorOptions {
  readonly statement?: CerialStatement;
  readonly plan?: MigrationPlan;
}

/**
 * A migration failed: a model's lazy migration, a plan that rolled back, the migration lease, or a state write.
 * The database error, when there is one, is the `cause`.
 */
export class CerialMigrationError extends CerialError {
  /**
   * The DDL that failed. Always present for a failed migration, unlike a query's statement: it is
   * generated from the schema and holds no bound user values.
   */
  readonly statement?: CerialStatement;
  /** What would bring the database to the generated schema, on a verify refusal. Nothing was applied. */
  readonly plan?: MigrationPlan;

  constructor(message: string, options: CerialMigrationErrorOptions = {}) {
    super(CERIAL_ERROR_CODES.MIGRATION, message, options);
    this.name = 'CerialMigrationError';
    this.statement = options.statement;
    this.plan = options.plan;
  }
}

/** What a database error carries beyond the common context. */
export interface CerialDatabaseErrorOptions extends CerialErrorOptions {
  /** The generated statement and its bound values. Present only when the client sets `includeStatementInErrors`. */
  readonly statement?: CerialStatement;
}

/** A database error Cerial does not classify further. Wraps the raw error as `cause`. */
export class CerialDatabaseError extends CerialError {
  /**
   * The statement that failed, with its bound values. Absent unless the client opted in with
   * `includeStatementInErrors`, because the values are user data and an error often reaches a log.
   */
  readonly statement?: CerialStatement;

  constructor(message: string, options: CerialDatabaseErrorOptions = {}) {
    super(CERIAL_ERROR_CODES.DATABASE, message, options);
    this.name = 'CerialDatabaseError';
    this.statement = options.statement;
  }
}
