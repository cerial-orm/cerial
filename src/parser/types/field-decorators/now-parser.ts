/**
 * Parser for @now decorator
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Check if a token is the @now decorator */
export function isNowDecorator(token: string): boolean {
  return token === '@now';
}

/** Parse @now decorator */
export function parseNowDecorator(range: SourceRange): ASTDecorator {
  return createDecorator('now', range);
}
