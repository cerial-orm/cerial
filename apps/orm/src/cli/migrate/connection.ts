import { CerialConnectionError } from '../../errors';
import type { ConnectionConfig } from '../../types';
import { validateConnectionUrls } from '../validators/connection-url-validator';
import type { MigrateArgs } from './args';

/** The `CERIAL_DB_*` variables the migrate command reads. There is no flag for the password. */
export interface MigrateEnv {
  readonly CERIAL_DB_URL?: string;
  readonly CERIAL_DB_NAMESPACE?: string;
  readonly CERIAL_DB_DATABASE?: string;
  readonly CERIAL_DB_USERNAME?: string;
  readonly CERIAL_DB_PASSWORD?: string;
}

export interface ResolvedMigrateConnection {
  readonly url: string;
  readonly namespace: string;
  readonly database: string;
  readonly auth?: { readonly username: string; readonly password: string };
}

/** An empty variable counts as unset, so `CERIAL_DB_URL=` in a shell does not mask the config. */
function pick(...candidates: Array<string | undefined>): string | undefined {
  return candidates.find((candidate) => candidate !== undefined && candidate !== '');
}

/**
 * Resolve the connection a migrate command uses: flag, then `CERIAL_DB_*`, then the entry's configured
 * `connection`, field by field.
 *
 * A connection problem is a `CerialConnectionError`; a malformed flag never reaches here, `parseMigrateArgs`
 * refuses it as a validation error. A url that carries credentials is refused, and no message holds any
 * part of the url, because the messages reach CI logs.
 */
export function resolveMigrateConnection(
  flags: Pick<MigrateArgs, 'url' | 'namespace' | 'database' | 'username'>,
  env: MigrateEnv,
  configured?: ConnectionConfig,
): ResolvedMigrateConnection {
  const url = pick(flags.url, env.CERIAL_DB_URL, configured?.url);
  if (!url) {
    throw new CerialConnectionError(
      'No database url. Pass --url, set CERIAL_DB_URL, or set connection.url in the cerial config.',
      { operation: 'migrate' },
    );
  }

  validateConnectionUrls(
    [{ name: 'migrate', connection: { url } }],
    () =>
      new CerialConnectionError(
        [
          'The database url carries credentials (user or password before the host), so it was not used.',
          'Remove them from the url and set CERIAL_DB_USERNAME and CERIAL_DB_PASSWORD, or --username with CERIAL_DB_PASSWORD, or connection.auth in the cerial config.',
        ].join(' '),
        { operation: 'migrate' },
      ),
  );

  const namespace = pick(flags.namespace, env.CERIAL_DB_NAMESPACE, configured?.namespace);
  if (!namespace) {
    throw new CerialConnectionError(
      'No namespace. Pass --namespace, set CERIAL_DB_NAMESPACE, or set connection.namespace in the cerial config.',
      { operation: 'migrate' },
    );
  }

  const database = pick(flags.database, env.CERIAL_DB_DATABASE, configured?.database);
  if (!database) {
    throw new CerialConnectionError(
      'No database. Pass --database, set CERIAL_DB_DATABASE, or set connection.database in the cerial config.',
      { operation: 'migrate' },
    );
  }

  const username = pick(flags.username, env.CERIAL_DB_USERNAME, configured?.auth?.username);
  const password = pick(env.CERIAL_DB_PASSWORD, configured?.auth?.password);
  if (!username && !password) return { url, namespace, database };

  if (!username || !password) {
    throw new CerialConnectionError(
      username
        ? 'A username is set but no password. Set CERIAL_DB_PASSWORD, or connection.auth.password in the cerial config.'
        : 'A password is set but no username. Pass --username, set CERIAL_DB_USERNAME, or set connection.auth.username in the cerial config.',
      { operation: 'migrate' },
    );
  }

  return { url, namespace, database, auth: { username, password } };
}
