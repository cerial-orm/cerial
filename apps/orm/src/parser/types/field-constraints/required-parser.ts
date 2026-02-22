/**
 * Parser for required field constraint
 */

/** Check if a field declaration indicates required (no ? marker) */
export function isRequiredField(fieldDeclaration: string): boolean {
  return !fieldDeclaration.includes('?');
}

/** Parse required constraint from field tokens */
export function parseRequiredConstraint(tokens: string[]): boolean {
  // Field is required if there's no ? marker after the field name
  return !tokens.some((t) => t === '?');
}
