/**
 * Connection template - generates connection-related code
 */

import type { ModelMetadata } from '../../types';

/** Generate connection config interface */
export function generateConnectionConfigInterface(): string {
  return `export interface DbConnectionConfig {
  url: string;
  namespace?: string;
  database?: string;
  auth?: {
    username: string;
    password: string;
  };
}`;
}

/** Generate typed database proxy interface */
export function generateDbProxyInterface(models: ModelMetadata[]): string {
  const modelTypes = models.map((m) => `  ${m.name}: ${m.name}Model;`).join('\n');

  return `export interface DbClient {
${modelTypes}
}`;
}

/** Generate connection manager exports */
export function generateConnectionExports(): string {
  return `// Re-export connection types
export type { ConnectionConfig } from '@org/lib_backend_surreal-om';`;
}
