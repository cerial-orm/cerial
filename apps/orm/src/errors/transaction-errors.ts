import { CerialError, type CerialErrorOptions } from './cerial-error';
import { CERIAL_ERROR_CODES } from './codes';

/** A transaction was used in a way its state does not allow, or ended abnormally: already ended, nested, or timed out. */
export class CerialTransactionError extends CerialError {
  constructor(message: string, options?: CerialErrorOptions) {
    super(CERIAL_ERROR_CODES.TRANSACTION, message, options);
    this.name = 'CerialTransactionError';
  }
}
