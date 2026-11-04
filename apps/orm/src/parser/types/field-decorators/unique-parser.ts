/**
 * Parser for @unique decorator
 *
 * Supports:
 * - @unique
 * - @unique(nullsNotDistinct) - the index treats null as one value (SurrealDB 4.0 NULLS NOT DISTINCT)
 *
 * Any other argument is invalid.
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Check that a @unique token carries no argument or nullsNotDistinct */
export function hasValidUniqueArgument(token: string): boolean {
  return token === '@unique' || /^@unique\(\s*nullsNotDistinct\s*\)$/.test(token);
}

/** The error for a @unique token hasValidUniqueArgument refuses */
export function invalidUniqueArgumentMessage(token: string): string {
  const arg = token.match(/^@unique\(\s*(.*?)\s*\)$/)?.[1] ?? token;

  return `Invalid @unique argument '${arg}'. Expected @unique or @unique(nullsNotDistinct).`;
}

/** Parse @unique decorator; throws on an argument hasValidUniqueArgument would refuse */
export function parseUniqueDecorator(token: string, range: SourceRange): ASTDecorator {
  if (!hasValidUniqueArgument(token)) throw new Error(invalidUniqueArgumentMessage(token));

  return token === '@unique' ? createDecorator('unique', range) : createDecorator('unique', range, 'nullsNotDistinct');
}
