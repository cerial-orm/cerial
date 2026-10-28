/**
 * Parser for @distinct decorator
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Parse @distinct decorator */
export function parseDistinctDecorator(range: SourceRange): ASTDecorator {
  return createDecorator('distinct', range);
}
