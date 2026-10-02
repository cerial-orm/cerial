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

/** A database error Cerial does not classify further. Wraps the raw error as `cause`. */
export class CerialDatabaseError extends CerialError {
  constructor(message: string, options?: CerialErrorOptions) {
    super(CERIAL_ERROR_CODES.DATABASE, message, options);
    this.name = 'CerialDatabaseError';
  }
}
