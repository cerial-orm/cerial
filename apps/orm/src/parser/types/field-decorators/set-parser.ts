/**
 * Parser for @set decorator
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Check if a token is the @set decorator */
export function isSetDecorator(token: string): boolean {
  return token === '@set';
}

/** Parse @set decorator */
export function parseSetDecorator(range: SourceRange): ASTDecorator {
  return createDecorator('set', range);
}
