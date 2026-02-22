/**
 * Parser for @createdAt decorator
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Check if a token is the @createdAt decorator */
export function isCreatedAtDecorator(token: string): boolean {
  return token === '@createdAt';
}

/** Parse @createdAt decorator */
export function parseCreatedAtDecorator(range: SourceRange): ASTDecorator {
  return createDecorator('createdAt', range);
}
