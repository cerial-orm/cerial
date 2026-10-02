import { CerialError, type CerialErrorOptions } from './cerial-error';
import { CERIAL_ERROR_CODES } from './codes';

/** A model name that is not in the schema was used, for example `client.db.Uesr`. */
export class CerialUnknownModelError extends CerialError {
  constructor(message: string, options?: CerialErrorOptions) {
    super(CERIAL_ERROR_CODES.UNKNOWN_MODEL, message, options);
    this.name = 'CerialUnknownModelError';
  }
}

/** A field name that the model does not have was used in `where`, `select`, `orderBy`, `include` or `data`. */
export class CerialUnknownFieldError extends CerialError {
  constructor(message: string, options?: CerialErrorOptions) {
    super(CERIAL_ERROR_CODES.UNKNOWN_FIELD, message, options);
    this.name = 'CerialUnknownFieldError';
  }
}
