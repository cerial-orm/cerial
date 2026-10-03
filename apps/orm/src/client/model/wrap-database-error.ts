import { SurrealError } from 'surrealdb';
import { CerialDatabaseError, CerialError } from '../../errors';
import type { CompiledQuery } from '../../query/compile/types';

/**
 * The one place a driver error becomes a Cerial error. An error Cerial already classified passes
 * through untouched so its specific class is not buried, and so does anything that is not a driver
 * error (a bug should surface as itself). Classifying by database message belongs here and only here.
 */
export function wrapDatabaseError(
  error: unknown,
  model: string,
  operation: string,
  statement?: CompiledQuery,
): unknown {
  if (error instanceof CerialError || !(error instanceof SurrealError)) return error;

  return new CerialDatabaseError(`${operation} on ${model} failed: ${error.message}`, {
    model,
    operation,
    cause: error,
    statement,
  });
}
