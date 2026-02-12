/**
 * Parser for @index decorator
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Check if a token is the @index decorator */
export function isIndexDecorator(token: string): boolean {
  return token === '@index';
}

/** Parse @index decorator */
export function parseIndexDecorator(range: SourceRange): ASTDecorator {
  return createDecorator('index', range);
}
