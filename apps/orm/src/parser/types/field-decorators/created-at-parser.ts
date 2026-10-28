/**
 * Parser for @createdAt decorator
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Parse @createdAt decorator */
export function parseCreatedAtDecorator(range: SourceRange): ASTDecorator {
  return createDecorator('createdAt', range);
}
