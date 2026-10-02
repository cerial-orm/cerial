import { CerialError, type CerialErrorOptions } from './cerial-error';
import { CERIAL_ERROR_CODES } from './codes';

/** Input was rejected before any query was sent: wrong type, missing value, bad shape or a rule the schema forbids. */
export class CerialValidationError extends CerialError {
  constructor(message: string, options?: CerialErrorOptions) {
    super(CERIAL_ERROR_CODES.VALIDATION, message, options);
    this.name = 'CerialValidationError';
  }
}
