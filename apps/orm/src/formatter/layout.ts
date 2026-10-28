/**
 * Layout facts that only a parsed `.cerial` file has: which lines were blank and whether a block's
 * first value sat on the `{` line. A source-less AST (a `ts` origin) has none, so the printers
 * fall back to the canonical form when no layout is given.
 */

import type { CerialToken, Origin } from '../types';

export interface SourceLayout {
  /** Blank lines strictly between two 1-based lines. A line inside a block comment is blank only if the comment's own line is */
  blankLinesBetween(afterLine: number, beforeLine: number): number;
  /** Whether something other than a lone `}` follows the first `{` on a 1-based line */
  hasValueOnOpenLine(line: number): boolean;
}

const LAYOUT_TOKENS = new Set(['whitespace', 'newline', 'eof']);

/** Derive layout facts from the token stream the formatter already holds for comments */
export function buildSourceLayout(tokens: CerialToken[]): SourceLayout {
  const contentLines = new Set<number>();
  const afterOpenBrace = new Map<number, CerialToken[]>();

  for (const token of tokens) {
    if (LAYOUT_TOKENS.has(token.type)) continue;

    const parts = token.value.split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (parts[i]!.trim() !== '') contentLines.add(token.position.line + i);
    }

    const line = token.position.line;
    if (token.type === 'punctuation' && token.value === '{' && !afterOpenBrace.has(line)) {
      afterOpenBrace.set(line, []);
      continue;
    }
    afterOpenBrace.get(line)?.push(token);
  }

  return {
    blankLinesBetween(afterLine, beforeLine) {
      let count = 0;
      for (let line = afterLine + 1; line < beforeLine; line++) {
        if (!contentLines.has(line)) count++;
      }

      return count;
    },
    hasValueOnOpenLine(line) {
      const rest = afterOpenBrace.get(line);
      if (!rest?.length) return false;

      return !(rest.length === 1 && rest[0]!.value === '}');
    },
  };
}

interface Originated {
  origin: Origin;
}

/**
 * Blank lines between two nodes, or undefined when either has no source lines to measure
 * (no layout, or a `ts` origin). `afterEdge` picks the line the gap starts at: `start` for a
 * single-line field, `end` for a block.
 */
export function blankLinesBetweenNodes(
  layout: SourceLayout | undefined,
  after: Originated,
  before: Originated,
  afterEdge: 'start' | 'end',
): number | undefined {
  if (!layout || after.origin.kind !== 'dsl' || before.origin.kind !== 'dsl') return undefined;

  return layout.blankLinesBetween(after.origin.range[afterEdge].line, before.origin.range.start.line);
}
