import { Surreal } from 'surrealdb';
import { CerialConnectionError } from '../../errors';
import type { ResolvedMigrateConnection } from './connection';

export const join = (...parts: string[]): string => parts.join('');

/**
 * Schema loading logs progress with `console.log`, which would land in front of the `--json` object on stdout.
 * Status reports through its return value, so the loader's chatter goes to stderr for the duration of the load.
 */
export async function withLogsOnStderr<T>(work: () => Promise<T>): Promise<T> {
  const original = console.log;
  console.log = console.error;
  try {
    return await work();
  } finally {
    console.log = original;
  }
}

/** The message of a failed connect with the password taken out, since it reaches CI logs */
export function scrub(text: string, secret: string | undefined): string {
  return secret ? text.split(secret).join('***') : text;
}

export async function connect(connection: ResolvedMigrateConnection, operation: string): Promise<Surreal> {
  const surreal = new Surreal();
  try {
    await surreal.connect(connection.url, {
      namespace: connection.namespace,
      database: connection.database,
      ...(connection.auth ? { authentication: connection.auth } : {}),
    });
  } catch (error) {
    await surreal.close().catch(() => {});
    const cause = error instanceof Error ? error.message : String(error);

    throw new CerialConnectionError(
      join('Could not connect to ', connection.url, ': ', scrub(cause, connection.auth?.password)),
      { operation },
    );
  }

  return surreal;
}
