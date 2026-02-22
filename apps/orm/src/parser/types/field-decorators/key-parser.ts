/**
 * Parser for @key(name) decorator
 * Used on Relation types to disambiguate multiple relations to the same model
 * Also used for self-referential relations with reverse lookup
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Check if a token is the @key decorator */
export function isKeyDecorator(token: string): boolean {
  return token.startsWith('@key(');
}

/** Extract key name from @key(name) */
export function extractKeyName(token: string): string | undefined {
  const match = token.match(/^@key\((\w+)\)$/);

  return match?.[1];
}

/** Parse @key(name) decorator */
export function parseKeyDecorator(token: string, range: SourceRange): ASTDecorator {
  const keyName = extractKeyName(token);

  return createDecorator('key', range, keyName);
}
