/**
 * Parser for @defaultAlways(value) decorator
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Check if a token is a @defaultAlways decorator */
export function isDefaultAlwaysDecorator(token: string): boolean {
  return token.startsWith('@defaultAlways(');
}

/** Extract value from @defaultAlways(value) */
export function extractDefaultAlwaysValue(token: string): unknown {
  const match = token.match(/^@defaultAlways\((.+)\)$/);
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

/** Parse @defaultAlways(value) decorator */
export function parseDefaultAlwaysDecorator(token: string, range: SourceRange): ASTDecorator {
  const value = extractDefaultAlwaysValue(token);

  return createDecorator('defaultAlways', range, value);
}
