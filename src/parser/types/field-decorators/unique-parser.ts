/**
 * Parser for @unique decorator
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Check if a token is the @unique decorator */
export function isUniqueDecorator(token: string): boolean {
  return token === '@unique';
}

/** Parse @unique decorator */
export function parseUniqueDecorator(range: SourceRange): ASTDecorator {
  return createDecorator('unique', range);
}
