/**
 * Utility functions for schema name transformations
 */

/**
 * Convert schema name to PascalCase client class name
 * Examples: 'auth' -> 'AuthCerialClient', 'my-auth' -> 'MyAuthCerialClient'
 */
export function toClientClassName(schemaName: string | undefined | null): string {
  if (!schemaName) {
    return 'CerialClient';
  }

  const parts = schemaName.split(/[-_]+/);
  const pascalParts = parts.map((part) => {
    if (!part) return '';

    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  });

  const className = pascalParts.filter((p) => p.length > 0).join('');

  return className ? `${className}CerialClient` : 'CerialClient';
}
