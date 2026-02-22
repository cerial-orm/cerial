/**
 * Parser for @flexible decorator
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Check if a token is the @flexible decorator */
export function isFlexibleDecorator(token: string): boolean {
  return token === '@flexible';
}

/** Parse @flexible decorator */
export function parseFlexibleDecorator(range: SourceRange): ASTDecorator {
  return createDecorator('flexible', range);
}
