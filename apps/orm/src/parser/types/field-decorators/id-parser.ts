/**
 * Parser for @id decorator
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Parse @id decorator */
export function parseIdDecorator(range: SourceRange): ASTDecorator {
  return createDecorator('id', range);
}
