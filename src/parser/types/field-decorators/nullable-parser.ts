/**
 * Parser for @nullable decorator
 * Marks a field as accepting null as a value (distinct from NONE/absent via ?)
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Check if a token is the @nullable decorator */
export function isNullableDecorator(token: string): boolean {
  return token === '@nullable';
}

/** Parse @nullable decorator */
export function parseNullableDecorator(range: SourceRange): ASTDecorator {
  return createDecorator('nullable', range);
}
