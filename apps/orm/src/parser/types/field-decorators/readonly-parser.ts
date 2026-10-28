/**
 * Parser for @readonly decorator
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Parse @readonly decorator */
export function parseReadonlyDecorator(range: SourceRange): ASTDecorator {
  return createDecorator('readonly', range);
}
