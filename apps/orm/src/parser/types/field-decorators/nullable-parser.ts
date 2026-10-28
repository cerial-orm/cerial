/**
 * Parser for @nullable decorator
 * Marks a field as accepting null as a value (distinct from NONE/absent via ?)
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Parse @nullable decorator */
export function parseNullableDecorator(range: SourceRange): ASTDecorator {
  return createDecorator('nullable', range);
}
