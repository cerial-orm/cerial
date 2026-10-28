/**
 * Parser for @updatedAt decorator
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Parse @updatedAt decorator */
export function parseUpdatedAtDecorator(range: SourceRange): ASTDecorator {
  return createDecorator('updatedAt', range);
}
