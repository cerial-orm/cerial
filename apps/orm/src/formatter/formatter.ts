/**
 * Core formatting orchestrator.
 * `formatCerialSource` takes raw .cerial source, parses, tokenizes, attaches comments and hands the AST
 * to `printSchema`, which prints blocks and assembles the output from the AST alone.
 *
 * Comments are not stored on AST nodes. `printSchema` keeps them only when the caller
 * passes the attachments computed from a `.cerial` source text, and drops them for an AST with no source
 * (one built from TypeScript).
 */

import { parse } from '../parser/parser';
import { tokenize } from '../parser/tokenizer';
import type { ASTEnum, ASTLiteral, ASTModel, ASTObject, ASTTuple, SchemaAST, SourceRange } from '../types';
import type { CommentMap } from './comment-attacher';
import { attachComments } from './comment-attacher';
import { printEnum, printLiteral, printTuple } from './inline-printer';
import type { SourceLayout } from './layout';
import { blankLinesBetweenNodes, buildSourceLayout } from './layout';
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

  const tokens = tokenize(source);
  const comments = attachComments(tokens, ast);
  const layout = buildSourceLayout(tokens);

  const formatted = printSchema(ast, { ...options, comments, layout });

  return { formatted, changed: formatted !== source };
}

/** Options for `printSchema`: the format config plus the facts only a `.cerial` source text can supply. */
export interface PrintSchemaOptions extends FormatOptions {
  /**
   * Comment attachments from `attachComments(tokens, ast)`, taken from the source text of a `.cerial` input.
   * Omit it and no comment is printed.
   */
  comments?: CommentMap;
  /** Blank-line facts from `buildSourceLayout(tokens)`. Omit it and the canonical layout is printed. */
  layout?: SourceLayout;
}

/**
 * Print a whole schema AST as `.cerial` text, from the AST alone.
 *
 * Comments are not part of the AST, so they are kept when the caller passes the
 * attachments computed from source text (a `.cerial` input), and dropped for an AST with no source
 * (one built from TypeScript). Likewise only a `.cerial` input has a layout to honor; without one the
 * output is the canonical form. Pass the AST as parsed, before `resolveInheritance`, or `extends`
 * is flattened away.
 */
export function printSchema(ast: SchemaAST, options?: PrintSchemaOptions): string {
  const comments: CommentMap = options?.comments ?? new Map();
  const layout = options?.layout;
  const config = resolveConfig(options);

  const blocks = collectTopLevelBlocks(ast);

  const printedBlocks = blocks.map((block) => {
    switch (block.kind) {
      case 'model':
        return printModel(block.node as ASTModel, comments, config, layout);
      case 'object':
        return printObject(block.node as ASTObject, comments, config, layout);
      case 'enum':
        return printEnum(block.node as ASTEnum, comments, config, layout);
      case 'literal':
        return printLiteral(block.node as ASTLiteral, comments, config, layout);
      case 'tuple':
        return printTuple(block.node as ASTTuple, comments, config, layout);
    }
  });

  const outputParts: string[] = [];

  // Top-level comments (before first declaration)
  const topComments = comments.get('top');
  if (topComments?.leading.length) {
    outputParts.push(topComments.leading.map((c) => c.value).join('\n'));
  }

  // Block separation
  for (let i = 0; i < printedBlocks.length; i++) {
    const printed = printedBlocks[i]!;

    if (i > 0 || outputParts.length) {
      const separator = computeBlockSeparator(config.blockSeparation, blocks, layout, i, outputParts.length > 0);
      outputParts.push(separator);
    }

    outputParts.push(printed);
  }

  // Bottom comments (after last declaration)
  const bottomComments = comments.get('bottom');
  if (bottomComments?.leading.length) {
    outputParts.push('');
    outputParts.push(bottomComments.leading.map((c) => c.value).join('\n'));
  }

  // Handle orphan 'between:N' comments — these are rare edge cases
  appendOrphanComments(comments, outputParts);

  let formatted = outputParts.join('\n');

  // Comment style normalization
  if (config.commentStyle !== 'honor') {
    formatted = normalizeBlockCommentStyle(formatted, config.commentStyle);
  }

  return finalize(formatted);
}

/**
 * Compute the separator string between blocks or between top comments and first block.
 */
function computeBlockSeparator(
  blockSeparation: 1 | 2 | 'honor',
  blocks: TopLevelBlock[],
  layout: SourceLayout | undefined,
  blockIdx: number,
  hasTopComments: boolean,
): string {
  // outputParts.join('\n') contributes 1 newline between each element.
  // For N blank lines between blocks, we need N+1 total newlines.
  // The join adds 2 (one before separator, one after), so separator = '\n'.repeat(N - 1).
  if (blockSeparation !== 'honor') return '\n'.repeat(blockSeparation - 1);
  if (blockIdx === 0 && !hasTopComments) return '';

  // Honor: the original blank lines, at least 1 and at most 2. A node without source lines
  // (no layout, or a `ts` origin) has none to honor, so it gets the 1 minimum
  // Top comments to the first block: every blank line before it, comments' own gaps included
  const blankCount =
    blockIdx === 0
      ? layout
        ? layout.blankLinesBetween(0, blocks[0]!.range.start.line)
        : 0
      : (blankLinesBetweenNodes(layout, blocks[blockIdx - 1]!.node, blocks[blockIdx]!.node, 'end') ?? 0);
  const effective = Math.min(Math.max(blankCount, 1), 2);

  return '\n'.repeat(effective - 1);
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
