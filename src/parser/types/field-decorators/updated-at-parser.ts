/**
 * Parser for @updatedAt decorator
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Check if a token is the @updatedAt decorator */
export function isUpdatedAtDecorator(token: string): boolean {
  return token === '@updatedAt';
}

/** Parse @updatedAt decorator */
export function parseUpdatedAtDecorator(range: SourceRange): ASTDecorator {
  return createDecorator('updatedAt', range);
}
