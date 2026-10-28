/**
 * Parser for @index decorator
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Parse @index decorator */
export function parseIndexDecorator(range: SourceRange): ASTDecorator {
  return createDecorator('index', range);
}
