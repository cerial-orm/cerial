/**
 * Parser for @unique decorator
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Parse @unique decorator */
export function parseUniqueDecorator(range: SourceRange): ASTDecorator {
  return createDecorator('unique', range);
}
