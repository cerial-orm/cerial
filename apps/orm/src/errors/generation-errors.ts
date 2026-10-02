import { CerialError, type CerialErrorOptions } from './cerial-error';
import { CERIAL_ERROR_CODES } from './codes';

/** The schema or project configuration was rejected while generating the client. */
export class CerialGenerationError extends CerialError {
  constructor(message: string, options?: CerialErrorOptions) {
    super(CERIAL_ERROR_CODES.GENERATION, message, options);
    this.name = 'CerialGenerationError';
  }
}
