/**
 * Parser for @id decorator
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Check if a token is the @id decorator */
export function isIdDecorator(token: string): boolean {
  return token === '@id';
}

/** Parse @id decorator */
export function parseIdDecorator(range: SourceRange): ASTDecorator {
  return createDecorator('id', range);
}
