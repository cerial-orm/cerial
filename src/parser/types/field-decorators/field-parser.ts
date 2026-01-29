/**
 * Parser for @field(fieldName) decorator
 * Used on Relation types to reference the storage field (Record/Record[])
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Check if a token is the @field decorator */
export function isFieldDecorator(token: string): boolean {
  return token.startsWith('@field(');
}

/** Extract field name from @field(fieldName) */
export function extractFieldRef(token: string): string | undefined {
  const match = token.match(/^@field\((\w+)\)$/);
  return match?.[1];
}

/** Parse @field(fieldName) decorator */
export function parseFieldDecorator(token: string, range: SourceRange): ASTDecorator {
  const fieldRef = extractFieldRef(token);
  return createDecorator('field', range, fieldRef);
}
