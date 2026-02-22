/**
 * Parser for optional field constraint
 */

/** Check if a field declaration indicates optional (has ? marker) */
export function isOptionalField(fieldDeclaration: string): boolean {
  return fieldDeclaration.includes('?');
}

/** Parse optional constraint from field tokens */
export function parseOptionalConstraint(tokens: string[]): boolean {
  // Field is optional if there's a ? marker
  return tokens.some((t) => t === '?');
}
