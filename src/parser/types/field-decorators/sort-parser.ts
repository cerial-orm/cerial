/**
 * Parser for @sort decorator
 *
 * Supports:
 * - @sort - ascending (default)
 * - @sort() - ascending (default)
 * - @sort(true) - ascending
 * - @sort(false) - descending
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Check if a token is a @sort decorator */
export function isSortDecorator(token: string): boolean {
  return token === '@sort' || token.startsWith('@sort(');
}

/**
 * Extract sort direction from @sort decorator
 * Returns true for ascending, false for descending
 */
export function extractSortValue(token: string): boolean {
  if (token === '@sort') return true;

  const match = token.match(/^@sort\((\w*)\)$/);
  if (!match) return true;

  const value = match[1]?.trim();
  if (value === '' || value === 'true') return true;
  if (value === 'false') return false;

  return true;
}

/** Parse @sort decorator */
export function parseSortDecorator(token: string, range: SourceRange): ASTDecorator {
  const value = extractSortValue(token);

  return createDecorator('sort', range, value);
}
