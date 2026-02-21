/**
 * Safe wrappers around cerial's parse() and tokenize() functions.
 *
 * The cerial parser handles ALL string inputs gracefully (returns errors in-band),
 * but throws TypeError on non-string inputs (undefined, null, number, object).
 * These wrappers guarantee no exceptions reach the language server.
 */

import { parse } from '../../../../src/parser';
import { tokenize } from '../../../../src/parser/tokenizer';
import type { ParseResult, SchemaAST, Token } from '../../../../src/types';

const EMPTY_AST: SchemaAST = {
  models: [],
  objects: [],
  tuples: [],
  literals: [],
  enums: [],
  source: '',
};

/**
 * Safe wrapper around cerial's `parse()`. Never throws.
 *
 * For string inputs, `parse()` already returns errors in-band via `ParseResult.errors[]`.
 * This wrapper adds defense against non-string inputs and any future parser regressions.
 */
export function safeParse(
  source: string,
  ...args: Parameters<typeof parse> extends [string, ...infer R] ? R : never[]
): ParseResult {
  if (typeof source !== 'string') {
    return {
      ast: { ...EMPTY_AST, source: '' },
      errors: [
        {
          message: `Expected string source, got ${typeof source}`,
          position: { line: 1, column: 0, offset: 0 },
        },
      ],
    };
  }

  try {
    return parse(source, ...args);
  } catch (error) {
    return {
      ast: { ...EMPTY_AST, source },
      errors: [
        {
          message: error instanceof Error ? error.message : 'Parse error',
          position: { line: 1, column: 0, offset: 0 },
        },
      ],
    };
  }
}

/**
 * Safe wrapper around cerial's `tokenize()`. Never throws.
 *
 * For string inputs, `tokenize()` already handles all edge cases gracefully.
 * This wrapper adds defense against non-string inputs and any future regressions.
 */
export function safeTokenize(source: string): Token[] {
  if (typeof source !== 'string') {
    return [];
  }

  try {
    return tokenize(source);
  } catch {
    return [];
  }
}
