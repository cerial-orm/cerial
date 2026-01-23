/**
 * Client template - base template for generated client
 */

/** Generate imports for client */
export function generateImports(): string {
  return `import { createConnectionManager, type DatabaseProxy } from '@org/lib_backend_surreal-om';
import type { ConnectionConfig } from '@org/lib_backend_surreal-om';
import { modelRegistry } from './internal/model-registry';`;
}

/** Generate client setup code */
export function generateClientSetup(): string {
  return `// Connection manager instance
const connectionManager = createConnectionManager(modelRegistry);

// Database proxy (available after connect)
export let db: DatabaseProxy<typeof modelRegistry>;`;
}

/** Generate connect function */
export function generateConnectFunction(): string {
  return `/**
 * Connect to the database
 * @param config - Optional connection configuration
 * @param name - Optional connection name (default: 'default')
 */
export async function $connect(config?: ConnectionConfig, name?: string): Promise<DatabaseProxy<typeof modelRegistry>> {
  db = await connectionManager.connect(config, name);
  return db;
}`;
}

/** Generate disconnect function */
export function generateDisconnectFunction(): string {
  return `/**
 * Disconnect from the database
 * @param name - Optional connection name (default: 'default')
 */
export async function $disconnect(name?: string): Promise<void> {
  await connectionManager.disconnect(name);
}`;
}

/** Generate useConnection function */
export function generateUseConnectionFunction(): string {
  return `/**
 * Use a specific named connection
 * @param name - Connection name
 */
export function $useConnection(name: string): DatabaseProxy<typeof modelRegistry> {
  return connectionManager.useConnection(name);
}`;
}

/** Generate the full client template */
export function generateClientTemplate(): string {
  return `${generateImports()}

${generateClientSetup()}

${generateConnectFunction()}

${generateDisconnectFunction()}

${generateUseConnectionFunction()}
`;
}
