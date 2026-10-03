import { CerialError, type CerialErrorOptions } from './cerial-error';
import { CERIAL_ERROR_CODES } from './codes';

/** A write violated a unique constraint. Wraps the database error as `cause`. */
export class CerialUniqueConstraintError extends CerialError {
  constructor(message: string, options?: CerialErrorOptions) {
    super(CERIAL_ERROR_CODES.UNIQUE_CONSTRAINT, message, options);
    this.name = 'CerialUniqueConstraintError';
  }
}

/** A model's lazy migration failed. `model` names the model; the database error is the `cause`. */
export class CerialMigrationError extends CerialError {
  constructor(message: string, options?: CerialErrorOptions) {
    super(CERIAL_ERROR_CODES.MIGRATION, message, options);
    this.name = 'CerialMigrationError';
  }
}

/** What a database error carries beyond the common context. */
export interface CerialDatabaseErrorOptions extends CerialErrorOptions {
  /** The generated statement and its bound values. Present only when the client sets `includeStatementInErrors`. */
  readonly statement?: { readonly text: string; readonly vars: Readonly<Record<string, unknown>> };
}

/** A database error Cerial does not classify further. Wraps the raw error as `cause`. */
export class CerialDatabaseError extends CerialError {
  /**
   * The statement that failed, with its bound values. Absent unless the client opted in with
   * `includeStatementInErrors`, because the values are user data and an error often reaches a log.
   */
  readonly statement?: { readonly text: string; readonly vars: Readonly<Record<string, unknown>> };

  constructor(message: string, options: CerialDatabaseErrorOptions = {}) {
    super(CERIAL_ERROR_CODES.DATABASE, message, options);
    this.name = 'CerialDatabaseError';
    this.statement = options.statement;
  }
}
