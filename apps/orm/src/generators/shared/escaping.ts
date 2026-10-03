/**
 * Escapers for schema-derived text that reaches generated output.
 *
 * The two functions implement different languages' rules and must not be merged:
 * a value placed in emitted TypeScript source and a value placed in emitted
 * SurrealQL are parsed by different grammars. Both return the escaped body only,
 * the caller supplies the surrounding single quotes.
 */

/** Applied before the quote: escaping it afterwards would double the backslash that guards the quote. */
const BACKSLASH = /\\/g;

/** Escape text for the inside of a single-quoted TypeScript string literal. */
export function escapeTsString(value: string): string {
  return value.replace(BACKSLASH, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

/** Escape text for the inside of a single-quoted SurrealQL string literal. */
export function escapeSurqlString(value: string): string {
  return value.replace(BACKSLASH, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}
