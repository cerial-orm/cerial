import { CerialError, type CerialErrorOptions } from './cerial-error';
import { CERIAL_ERROR_CODES } from './codes';

/** The schema or project configuration was rejected while generating the client. */
export class CerialGenerationError extends CerialError {
  constructor(message: string, options?: CerialErrorOptions) {
    super(CERIAL_ERROR_CODES.GENERATION, message, options);
    this.name = 'CerialGenerationError';
  }
}

/** A config found while searching subdirectories declares `schema` or `schemas`, so it is a root config, not a folder config. */
export class CerialConfigNotFolderConfigError extends CerialGenerationError {
  constructor(message: string, options?: CerialErrorOptions) {
    super(message, options);
    this.name = 'CerialConfigNotFolderConfigError';
  }
}
