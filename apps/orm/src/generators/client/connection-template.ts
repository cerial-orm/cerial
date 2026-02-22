/**
 * Connection template - generates connection-related code
 */

/** Generate connection manager exports */
export function generateConnectionExports(): string {
  return `// Re-export connection types
export type { ConnectionConfig } from 'cerial';`;
}
