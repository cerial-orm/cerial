/**
 * Parser for @distinct decorator
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Check if a token is the @distinct decorator */
export function isDistinctDecorator(token: string): boolean {
  return token === '@distinct';
}

/** Parse @distinct decorator */
export function parseDistinctDecorator(range: SourceRange): ASTDecorator {
  return createDecorator('distinct', range);
}
