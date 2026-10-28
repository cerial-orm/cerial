/**
 * Parser for @now decorator
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Parse @now decorator */
export function parseNowDecorator(range: SourceRange): ASTDecorator {
  return createDecorator('now', range);
}
