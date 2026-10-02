import { CerialError, type CerialErrorOptions } from './cerial-error';
import { CERIAL_ERROR_CODES } from './codes';

/** A query was issued with no live connection: before `connect()`, after `disconnect()`, or against a named connection that is not connected. */
export class CerialNotConnectedError extends CerialError {
  constructor(message: string, options?: CerialErrorOptions) {
    super(CERIAL_ERROR_CODES.NOT_CONNECTED, message, options);
    this.name = 'CerialNotConnectedError';
  }
}

/** The connection could not be found, configured, opened or kept. Wraps the driver error as `cause` when one caused it. */
export class CerialConnectionError extends CerialError {
  constructor(message: string, options?: CerialErrorOptions) {
    super(CERIAL_ERROR_CODES.CONNECTION, message, options);
    this.name = 'CerialConnectionError';
  }
}
