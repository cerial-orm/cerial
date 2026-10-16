import {
  CerialConnectionError,
  CerialDatabaseError,
  type CerialErrorCode,
  CerialGenerationError,
  CerialMigrationError,
  CerialNotConnectedError,
  CerialSessionLostError,
  CerialTransactionError,
  CerialUniqueConstraintError,
  CerialUnknownFieldError,
  CerialUnknownModelError,
  CerialValidationError,
} from '../../../src/errors';

export interface ErrorClassCase {
  readonly name: string;
  readonly ctor: new (message: string, options?: ConstructorParameters<typeof CerialValidationError>[1]) => Error;
  readonly code: CerialErrorCode;
}

/** One entry per subclass, in the order the taxonomy lists them. */
export const ERROR_CLASSES: ErrorClassCase[] = [
  { name: 'CerialNotConnectedError', ctor: CerialNotConnectedError, code: 'C1000' },
  { name: 'CerialConnectionError', ctor: CerialConnectionError, code: 'C1001' },
  { name: 'CerialSessionLostError', ctor: CerialSessionLostError, code: 'C1002' },
  { name: 'CerialUnknownModelError', ctor: CerialUnknownModelError, code: 'C2000' },
  { name: 'CerialUnknownFieldError', ctor: CerialUnknownFieldError, code: 'C2001' },
  { name: 'CerialMigrationError', ctor: CerialMigrationError, code: 'C2002' },
  { name: 'CerialValidationError', ctor: CerialValidationError, code: 'C3000' },
  { name: 'CerialTransactionError', ctor: CerialTransactionError, code: 'C5000' },
  { name: 'CerialUniqueConstraintError', ctor: CerialUniqueConstraintError, code: 'C6000' },
  { name: 'CerialDatabaseError', ctor: CerialDatabaseError, code: 'C6001' },
  { name: 'CerialGenerationError', ctor: CerialGenerationError, code: 'C7000' },
];

/** What a callback throws, or undefined when it does not throw. A thrown non-error is returned as it is. */
export function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }

  return undefined;
}

/** The classes a thrown error must not be an instance of: every sibling of the one expected. */
export function wrongClasses(expected: new (...args: never[]) => Error): ErrorClassCase['ctor'][] {
  return ERROR_CLASSES.map((c) => c.ctor).filter((ctor) => ctor !== expected);
}
