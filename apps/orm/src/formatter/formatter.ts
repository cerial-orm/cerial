/**
 * Core formatting orchestrator.
 * Takes raw .cerial source, parses, tokenizes, attaches comments, prints blocks,
 * and assembles the formatted output.
 */

import { parse } from '../parser/parser';
import { tokenize } from '../parser/tokenizer';
import type { ASTEnum, ASTLiteral, ASTModel, ASTObject, ASTTuple, SchemaAST, SourceRange } from '../types';
import type { CommentMap } from './comment-attacher';
import { attachComments } from './comment-attacher';
import { printEnum, printLiteral, printTuple } from './inline-printer';
import { printModel, printObject } from './printer';
import { resolveConfig } from './rules';
import type { FormatOptions, FormatResult } from './types';

/** A top-level AST block with its kind, name, and source range for ordering */
interface TopLevelBlock {
  kind: 'model' | 'object' | 'enum' | 'literal' | 'tuple';
  name: string;
  range: SourceRange;
  node: ASTModel | ASTObject | ASTEnum | ASTLiteral | ASTTuple;
}

/**
 * Collect all top-level blocks from the AST, sorted by source declaration order.
 */
function collectTopLevelBlocks(ast: SchemaAST): TopLevelBlock[] {
  const blocks: TopLevelBlock[] = [];

  for (const m of ast.models) {
    blocks.push({ kind: 'model', name: m.name, range: m.range, node: m });
  }
  for (const o of ast.objects) {
    blocks.push({ kind: 'object', name: o.name, range: o.range, node: o });
  }
  for (const e of ast.enums) {
    blocks.push({ kind: 'enum', name: e.name, range: e.range, node: e });
  }
  for (const l of ast.literals) {
    blocks.push({ kind: 'literal', name: l.name, range: l.range, node: l });
  }
  for (const t of ast.tuples) {
    blocks.push({ kind: 'tuple', name: t.name, range: t.range, node: t });
  }

  blocks.sort((a, b) => a.range.start.line - b.range.start.line);

  return blocks;
}

/**
 * Normalize comment text to the target style.
 *
 * - `'hash'`: `// comment` → `# comment`, `/* ... *​/` → `# ...`
 * - `'slash'`: `# comment` → `// comment`
 */
export function normalizeCommentText(text: string, targetStyle: 'hash' | 'slash'): string {
  const trimmed = text.trimStart();

  if (targetStyle === 'hash') {
    // // comment → # comment
    if (trimmed.startsWith('//')) {
      const rest = trimmed.slice(2);

      return `#${rest}`;
    }
    // /* ... */ → # ... (strip block comment markers)
    if (trimmed.startsWith('/*')) {
      let inner = trimmed.slice(2);
      if (inner.endsWith('*/')) {
        inner = inner.slice(0, -2);
      }
      // Flatten multi-line block comments: split on newlines, prefix each with #
      const lines = inner.split('\n').map((l) => l.trim());
      if (lines.length === 1) {
        const content = lines[0]!.trim();

        return content ? `# ${content}` : '#';
      }

      return lines
        .filter((l) => l.length > 0)
        .map((l) => {
          // Strip leading * from block comment continuation lines
          const cleaned = l.startsWith('*') ? l.slice(1).trim() : l;

          return cleaned ? `# ${cleaned}` : '#';
        })
        .join('\n');
    }

    return text;
  }

  // targetStyle === 'slash'
  if (trimmed.startsWith('#')) {
    const rest = trimmed.slice(1);

    return `//${rest}`;
  }

  return text;
}

/**
 * Apply comment style normalization to a formatted block string.
 * Replaces comment tokens in the output text with the target style.
 */
function normalizeBlockCommentStyle(block: string, targetStyle: 'hash' | 'slash'): string {
  return block
    .split('\n')
    .map((line) => {
      const stripped = line.trimStart();
      const indent = line.slice(0, line.length - stripped.length);

      // Detect comment lines
      if (stripped.startsWith('#') || stripped.startsWith('//') || stripped.startsWith('/*')) {
        return indent + normalizeCommentText(stripped, targetStyle);
      }

      // Detect trailing comments on non-comment lines
      const trailingHashIdx = findTrailingCommentIndex(stripped, '#');
      const trailingSlashIdx = findTrailingCommentIndex(stripped, '//');

      let commentIdx = -1;
      if (trailingHashIdx !== -1 && trailingSlashIdx !== -1) {
        commentIdx = Math.min(trailingHashIdx, trailingSlashIdx);
      } else if (trailingHashIdx !== -1) {
        commentIdx = trailingHashIdx;
      } else if (trailingSlashIdx !== -1) {
        commentIdx = trailingSlashIdx;
      }

      if (commentIdx !== -1) {
        const code = stripped.slice(0, commentIdx);
        const comment = stripped.slice(commentIdx);

        return indent + code + normalizeCommentText(comment, targetStyle);
      }

      return line;
    })
    .join('\n');
}

/**
 * Find the index of a trailing comment marker in a line,
 * skipping occurrences inside quoted strings.
 */
function findTrailingCommentIndex(line: string, marker: string): number {
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;

    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (line.startsWith(marker, i)) {
        // Must be preceded by whitespace to be a trailing comment
        // (not first char — that's a full comment line handled above)
        if (i > 0 && /\s/.test(line[i - 1]!)) {
          return i;
        }
      }
    }
  }

  return -1;
}

/**
 * Count blank lines between the end of one block and the start of the next
 * in the original source. Caps at 2.
 */
function countSourceBlankLinesBetween(sourceLines: string[], endLine: number, startLine: number): number {
  let count = 0;
  for (let lineNum = endLine + 1; lineNum < startLine; lineNum++) {
    if (sourceLines[lineNum - 1]?.trim() === '') {
      count++;
    }
  }

  return Math.min(count, 2);
}

/**
 * Format a .cerial schema source string.
 *
 * Pipeline: parse → validate → tokenize → attach comments → resolve config → print → assemble
 *
 * @param source - Raw .cerial source string
 * @param options - Optional formatting configuration
 * @returns FormatResult with formatted string, or error info
 */
export function formatCerialSource(source: string, options?: FormatOptions): FormatResult {
  // 1. Parse and validate
  const { ast, errors } = parse(source);

  if (errors.length > 0) {
    const first = errors[0]!;

    return {
      error: {
        message: first.message,
        line: first.position.line,
        column: first.position.column,
      },
    };
  }

  // 2. Tokenize for comments
  const tokens = tokenize(source);

  // 3. Attach comments to AST nodes
  const comments = attachComments(tokens, ast);

  // 4. Resolve config
  const config = resolveConfig(options);

  // 5. Collect all top-level blocks in source order
  const blocks = collectTopLevelBlocks(ast);

  // 6. Print each block
  const printedBlocks = blocks.map((block) => {
    switch (block.kind) {
      case 'model':
        return printModel(block.node as ASTModel, comments, config, source);
      case 'object':
        return printObject(block.node as ASTObject, comments, config, source);
      case 'enum':
        return printEnum(block.node as ASTEnum, comments, config, source);
      case 'literal':
        return printLiteral(block.node as ASTLiteral, comments, config, source);
      case 'tuple':
        return printTuple(block.node as ASTTuple, comments, config, source);
    }
  });

  // 7. Assemble output
  const outputParts: string[] = [];

  // Top-level comments (before first declaration)
  const topComments = comments.get('top');
  if (topComments?.leading.length) {
    outputParts.push(topComments.leading.map((c) => c.value).join('\n'));
  }

  // Block separation
  const sourceLines = source.split('\n');

  for (let i = 0; i < printedBlocks.length; i++) {
    const printed = printedBlocks[i]!;

    if (i > 0 || outputParts.length > 0) {
      // Determine separator
      const separator = computeBlockSeparator(config.blockSeparation, blocks, sourceLines, i, outputParts.length > 0);
      outputParts.push(separator);
    }

    outputParts.push(printed);
  }

  // Bottom comments (after last declaration)
  const bottomComments = comments.get('bottom');
  if (bottomComments?.leading.length) {
    // Separator before bottom comments
    outputParts.push('');
    outputParts.push(bottomComments.leading.map((c) => c.value).join('\n'));
  }

  // Handle orphan 'between:N' comments — these are rare edge cases
  appendOrphanComments(comments, outputParts);

  let formatted = outputParts.join('\n');

  // 10. Comment style normalization
  if (config.commentStyle !== 'honor') {
    formatted = normalizeBlockCommentStyle(formatted, config.commentStyle);
  }

  // 11. Finalize
  formatted = finalize(formatted);

  // 12. Compare
  const changed = formatted !== source;

  return { formatted, changed };
}

/**
 * Compute the separator string between blocks or between top comments and first block.
 */
function computeBlockSeparator(
  blockSeparation: 1 | 2 | 'honor',
  blocks: TopLevelBlock[],
  sourceLines: string[],
  blockIdx: number,
  hasTopComments: boolean,
): string {
  // outputParts.join('\n') contributes 1 newline between each element.
  // For N blank lines between blocks, we need N+1 total newlines.
  // The join adds 2 (one before separator, one after), so separator = '\n'.repeat(N - 1).
  if (blockSeparation === 'honor') {
    if (blockIdx === 0 && hasTopComments) {
      // Between top comments and first block: count blank lines from source start to first block
      const firstBlockStart = blocks[0]!.range.start.line;
      const blankCount = countSourceBlankLinesBetween(sourceLines, 0, firstBlockStart);
      const effective = Math.max(blankCount, 1);

      return '\n'.repeat(Math.max(effective - 1, 0));
    }
    if (blockIdx > 0) {
      const prevEnd = blocks[blockIdx - 1]!.range.end.line;
      const currStart = blocks[blockIdx]!.range.start.line;
      const blankCount = countSourceBlankLinesBetween(sourceLines, prevEnd, currStart);
      const effective = Math.max(blankCount, 1);

      return '\n'.repeat(Math.max(effective - 1, 0));
    }

    return '';
  }

  // Fixed separation: N blank lines → separator = '\n'.repeat(N - 1)
  return '\n'.repeat(blockSeparation - 1);
}

/**
 * Append any orphan comments (between:N) to the output.
 */
function appendOrphanComments(comments: CommentMap, outputParts: string[]): void {
  for (const [key, entry] of comments) {
    if (key.startsWith('between:') && entry.leading.length) {
      outputParts.push('');
      outputParts.push(entry.leading.map((c) => c.value).join('\n'));
    }
  }
}

/**
 * Finalize the formatted output:
 * - Normalize line endings to \n
 * - Strip trailing whitespace from each line
 * - Ensure file ends with exactly one \n
 */
function finalize(text: string): string {
  // Normalize line endings
  let result = text.replace(/\r\n?/g, '\n');

  // Strip trailing whitespace from each line
  result = result
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');

  // Ensure exactly one trailing newline
  result = `${result.trimEnd()}\n`;

  return result;
}
