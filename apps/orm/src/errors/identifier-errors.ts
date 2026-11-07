import { CerialError, type CerialErrorOptions } from './cerial-error';
import { escapeControl } from '../utils/safe-text';
import { CERIAL_ERROR_CODES } from './codes';

/** A model name that is not in the schema was used, for example `client.db.Uesr`. */
export class CerialUnknownModelError extends CerialError {
  constructor(message: string, options?: CerialErrorOptions) {
    super(CERIAL_ERROR_CODES.UNKNOWN_MODEL, message, options);
    this.name = 'CerialUnknownModelError';
  }

  /**
   * The one message shape every model accessor uses, so `client.db`, a transaction client and the
   * generated client cannot drift apart.
   */
  static forModel(name: string, validModels: readonly string[]): CerialUnknownModelError {
    const valid = validModels.length ? `Valid models: ${validModels.join(', ')}.` : 'No models are registered.';

    return new CerialUnknownModelError(`Unknown model "${escapeControl(name)}". ${valid}`, { model: name });
  }
}

/** A field name that the model does not have was used in `where`, `select`, `orderBy`, `include` or `data`. */
export class CerialUnknownFieldError extends CerialError {
  constructor(message: string, options?: CerialErrorOptions) {
    super(CERIAL_ERROR_CODES.UNKNOWN_FIELD, message, options);
    this.name = 'CerialUnknownFieldError';
  }
}
