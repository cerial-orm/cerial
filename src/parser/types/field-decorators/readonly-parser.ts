/**
 * Parser for @readonly decorator
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Check if a token is the @readonly decorator */
export function isReadonlyDecorator(token: string): boolean {
  return token === '@readonly';
}

/** Parse @readonly decorator */
export function parseReadonlyDecorator(range: SourceRange): ASTDecorator {
  return createDecorator('readonly', range);
}
