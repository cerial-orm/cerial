import type { CerialErrorCode } from './codes';

/** Context a Cerial error can carry. All of it is optional: not every failure has a model or an operation. */
export interface CerialErrorOptions {
  /** The model the failing call was made on. */
  readonly model?: string;
  /** The Cerial call that failed, for example `findMany` or `updateUnique`. */
  readonly operation?: string;
  /** The field the failure is about. */
  readonly field?: string;
  /** The error that caused this one, kept as the standard `cause` so the raw database error is not lost. */
  readonly cause?: unknown;
}

/**
 * Base of every error Cerial raises. Branch on a subclass with `instanceof`, or on `code` when only
 * the kind matters. Never match on `message`: its wording is free to change.
 */
export class CerialError extends Error {
  readonly code: CerialErrorCode;
  readonly model?: string;
  readonly operation?: string;
  readonly field?: string;

  constructor(code: CerialErrorCode, message: string, options: CerialErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    // Set by hand rather than from `new.target.name`, which a minifier would mangle.
    this.name = 'CerialError';
    this.code = code;
    this.model = options.model;
    this.operation = options.operation;
    this.field = options.field;
  }
}
