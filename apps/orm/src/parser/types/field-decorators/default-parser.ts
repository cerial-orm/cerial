/**
 * Parser for @default(value) decorator
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Check if a token is a @default(value) decorator (not @defaultAlways) */
export function isDefaultDecorator(token: string): boolean {
  return token.startsWith('@default(');
}

/** Extract value from @default(value) */
export function extractDefaultValue(token: string): unknown {
  const match = token.match(/^@default\((.+)\)$/);
  if (!match) return undefined;

  const valueStr = match[1]!.trim();

  // Parse the value
  if (valueStr === 'true') return true;
  if (valueStr === 'false') return false;
  if (valueStr === 'null') return null;
  if (/^-?\d+$/.test(valueStr)) return parseInt(valueStr, 10);
  if (/^-?\d+\.\d+$/.test(valueStr)) return parseFloat(valueStr);
  if ((valueStr.startsWith('"') && valueStr.endsWith('"')) || (valueStr.startsWith("'") && valueStr.endsWith("'"))) {
    return valueStr.slice(1, -1);
  }

  return valueStr;
}

/** Parse @default(value) decorator */
export function parseDefaultDecorator(token: string, range: SourceRange): ASTDecorator {
  const value = extractDefaultValue(token);
  return createDecorator('default', range, value);
}
