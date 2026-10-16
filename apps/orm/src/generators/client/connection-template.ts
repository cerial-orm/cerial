import type { ConnectionConfig, DatabasePin } from '../../types';
import { escapeTsString } from '../shared/escaping';
import { generateDatabasePinCheck } from './database-pin-template';

/**
 * Connection template - generates connection-related code
 */

/** Generate connection manager exports */
export function generateConnectionExports(): string {
  return `// Re-export connection types
export type { ConnectionConfig } from 'cerial';`;
}

function quoted(value: string): string {
  return `'${escapeTsString(value)}'`;
}

/**
 * Emit the connection resolved at generate time as a module constant.
 * Only url, namespace and database are embedded: the generated directory is
 * committable, so credentials never reach it (they come from the environment at connect time).
 */
export function generateEmbeddedConnection(connection?: ConnectionConfig): string {
  if (!connection) return 'const EMBEDDED_CONNECTION: ConnectionConfig | undefined = undefined;';

  const parts = [`url: ${quoted(connection.url)}`];
  if (connection.namespace !== undefined) parts.push(`namespace: ${quoted(connection.namespace)}`);
  if (connection.database !== undefined) parts.push(`database: ${quoted(connection.database)}`);

  return `const EMBEDDED_CONNECTION: ConnectionConfig | undefined = { ${parts.join(', ')} };`;
}

/** Body lines of connect() that pick the connection a no-argument call uses. */
export function generateResolveConnection(configType: string, pins?: DatabasePin[]): string {
  return `    let resolved: ${configType};
    if (config) {
      resolved = config;
    } else {
      if (!EMBEDDED_CONNECTION) throw new CerialNotConnectedError('No connection was configured for this client. Pass a config to connect() or set a connection in the schema entry.', { operation: 'connect' });
      const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
      const username = env?.CERIAL_DB_USER;
      const password = env?.CERIAL_DB_PASS;
      if ((username === undefined) !== (password === undefined)) throw new CerialNotConnectedError('Set both CERIAL_DB_USER and CERIAL_DB_PASS, or neither.', { operation: 'connect' });
      resolved = username !== undefined && password !== undefined ? { ...EMBEDDED_CONNECTION, auth: { username, password } } : { ...EMBEDDED_CONNECTION };
    }${generateDatabasePinCheck(pins)}`;
}
