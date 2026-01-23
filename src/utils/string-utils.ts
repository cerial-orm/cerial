/**
 * String utility functions
 */

/** Convert PascalCase to snake_case */
export function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

/** Convert PascalCase to camelCase */
export function toCamelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

/** Convert snake_case to PascalCase */
export function toPascalCase(str: string): string {
  return str
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/** Escape special regex characters */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Escape string for SQL/SurrealQL */
export function escapeString(str: string): string {
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

/** Check if string is a valid identifier */
export function isValidIdentifier(str: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(str);
}

/** Capitalize first letter */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Lowercase first letter */
export function uncapitalize(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

/** Trim and normalize whitespace */
export function normalizeWhitespace(str: string): string {
  return str.trim().replace(/\s+/g, ' ');
}

/** Remove comments from a line */
export function removeComments(line: string): string {
  // Handle single-line comments
  const singleLineIndex = line.indexOf('//');
  if (singleLineIndex !== -1) {
    return line.slice(0, singleLineIndex);
  }
  return line;
}

/** Indent a string by a given number of spaces */
export function indent(str: string, spaces: number): string {
  const indentation = ' '.repeat(spaces);
  return str
    .split('\n')
    .map((line) => (line.trim() ? indentation + line : line))
    .join('\n');
}
