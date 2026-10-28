/**
 * Parser for @flexible decorator
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Parse @flexible decorator */
export function parseFlexibleDecorator(range: SourceRange): ASTDecorator {
  return createDecorator('flexible', range);
}
