/**
 * Parser for @set decorator
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Parse @set decorator */
export function parseSetDecorator(range: SourceRange): ASTDecorator {
  return createDecorator('set', range);
}
