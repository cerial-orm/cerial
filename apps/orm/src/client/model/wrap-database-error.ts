import {
  AlreadyExistsError,
  CallTerminatedError,
  ConnectionUnavailableError,
  HttpConnectionError,
  InternalError,
  NotAllowedError,
  ReconnectExhaustionError,
  ReconnectIterationError,
  SurrealError,
  UnexpectedConnectionError,
} from 'surrealdb';
import {
  CerialConnectionError,
  CerialDatabaseError,
  CerialError,
  CerialSessionLostError,
  CerialTransactionError,
  CerialUniqueConstraintError,
} from '../../errors';
import type { CompiledQuery } from '../../query/compile/types';

/**
 * SurrealDB reports a unique-index violation as prose with no structured field (kind `Internal`):
 * "Database index `uq` already contains 'x@y.z', with record `t:a`". The text is the only signal there
 * is, so it is read here and nowhere else. A duplicate record id is a different signal: the driver's `AlreadyExistsError` with a record detail.
 * The record may itself hold backticks (``user:`u-a` ``), so it runs to the closing one at the end.
 */
const UNIQUE_VIOLATION = /^Database index `([^`]+)` already contains ([\s\S]+), with record `(.+)`$/;

/**
 * What the server says when a write reaches a read-only transaction: "Cannot run CREATE on a read only
 * transaction" for a statement (kind `Internal`), "Couldn't write to a read only transaction" for DDL
 * (kind `Query`). Neither carries a structured field.
 */
const READ_ONLY_WRITE = /(?:on|to) a read only transaction/;

/** What the driver throws when the socket is gone, being re-opened, or never opened. */
const CONNECTION_LOSS = [
  CallTerminatedError,
  ConnectionUnavailableError,
  HttpConnectionError,
  ReconnectExhaustionError,
  ReconnectIterationError,
  UnexpectedConnectionError,
];

/**
 * A socket whose session the server dropped answers every query as the anonymous actor. The refusal
 * carries that actor as structured detail (`Auth` > `NotAllowed` > `actor: 'anonymous'`), so no message
 * text is read. A genuine refusal names the authenticated actor that was denied, never `anonymous`.
 */
function isLostSession(error: unknown): boolean {
  if (!(error instanceof NotAllowedError)) return false;
  const auth = error.details;
  if (auth?.kind !== 'Auth' || auth.details.kind !== 'NotAllowed') return false;

  return auth.details.details.actor === 'anonymous';
}

/**
 * The one place a driver error becomes a Cerial error. An error Cerial already classified passes
 * through untouched so its specific class is not buried, and so does anything that is not a driver
 * error (a bug should surface as itself). Classifying by database message belongs here and only here.
 * `model` is absent for a call that belongs to no model, such as committing a transaction.
 */
export function wrapDatabaseError(
  error: unknown,
  model: string | undefined,
  operation: string,
  statement?: CompiledQuery,
): unknown {
  if (error instanceof CerialError || !(error instanceof SurrealError)) return error;

  const call = model ? `${operation} on ${model}` : operation;
  const context = { model, operation, cause: error, statement };

  if (isLostSession(error)) {
    return new CerialSessionLostError(
      `${call} failed, the database session was lost and the connection is being re-established`,
      context,
    );
  }

  if (CONNECTION_LOSS.some((type) => error instanceof type)) {
    return new CerialConnectionError(
      `${call} failed, the database connection is unavailable: ${error.message}`,
      context,
    );
  }

  if (READ_ONLY_WRITE.test(error.message)) {
    return new CerialTransactionError(`${call} failed, the transaction is read-only: ${error.message}`, context);
  }

  const unique = error instanceof InternalError ? UNIQUE_VIOLATION.exec(error.message) : null;
  if (unique) {
    const [, index, value, record] = unique;

    return new CerialUniqueConstraintError(
      `${call} failed: unique index \`${index}\` already contains ${value} (record \`${record}\`)`,
      { ...context, conflict: 'index', index, value, record },
    );
  }

  // Only a record that exists is a unique conflict; a table or namespace that exists is not.
  if (error instanceof AlreadyExistsError && error.recordId) {
    return new CerialUniqueConstraintError(`${call} failed: record \`${error.recordId}\` already exists`, {
      ...context,
      conflict: 'record',
      record: error.recordId,
    });
  }

  return new CerialDatabaseError(`${call} failed: ${error.message}`, context);
}
