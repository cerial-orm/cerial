import { CerialError, type CerialErrorOptions } from './cerial-error';
import { CERIAL_ERROR_CODES, type CerialErrorCode } from './codes';

/** A query was issued with no live connection: before `connect()`, after `disconnect()`, or against a named connection that is not connected. */
export class CerialNotConnectedError extends CerialError {
  constructor(message: string, options?: CerialErrorOptions) {
    super(CERIAL_ERROR_CODES.NOT_CONNECTED, message, options);
    this.name = 'CerialNotConnectedError';
  }
}

/** The connection could not be found, configured, opened or kept. Wraps the driver error as `cause` when one caused it. */
export class CerialConnectionError extends CerialError {
  /** `code` is for subclasses that name a more specific connection fault; callers omit it. */
  constructor(message: string, options?: CerialErrorOptions, code: CerialErrorCode = CERIAL_ERROR_CODES.CONNECTION) {
    super(code, message, options);
    this.name = 'CerialConnectionError';
  }
}

/**
 * The socket is open but the server no longer holds its session, so the connection answers as an
 * anonymous client. Credentials and permissions are not at fault. A `CerialConnectionError`, so a
 * handler that retries or reports connection faults covers it; branch on this class to tell it apart.
 */
export class CerialSessionLostError extends CerialConnectionError {
  constructor(message: string, options?: CerialErrorOptions) {
    super(message, options, CERIAL_ERROR_CODES.SESSION_LOST);
    this.name = 'CerialSessionLostError';
  }
}
