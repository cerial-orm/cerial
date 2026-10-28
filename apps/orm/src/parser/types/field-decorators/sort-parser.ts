/**
 * Parser for @sort decorator
 *
 * Supports:
 * - @sort - ascending (default)
 * - @sort() - ascending (default)
 * - @sort(true) / @sort(asc) - ascending
 * - @sort(false) / @sort(desc) - descending
 *
 * Any other argument is invalid and never resolves to a direction.
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Check that a @sort token carries no argument or one of true / false / asc / desc */
export function hasValidSortArgument(token: string): boolean {
  return token === '@sort' || /^@sort\(\s*(true|false|asc|desc)?\s*\)$/.test(token);
}

/**
 * Extract sort direction from @sort decorator
 * Returns true for ascending, false for descending.
 * Throws on an argument hasValidSortArgument would refuse, so a typo can never become a direction.
 */
export function extractSortValue(token: string): boolean {
  if (!hasValidSortArgument(token)) throw new Error(`Invalid @sort argument in '${token}'`);

  const value = token.match(/^@sort\(\s*(\w*)\s*\)$/)?.[1];
  if (value === 'false' || value === 'desc') return false;

  return true;
}

/** Parse @sort decorator */
export function parseSortDecorator(token: string, range: SourceRange): ASTDecorator {
  const value = extractSortValue(token);

  return createDecorator('sort', range, value);
}
