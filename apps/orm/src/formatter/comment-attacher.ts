/**
 * Comment attacher for the formatter
 * Takes the full token stream (with comments preserved) and the parsed AST,
 * returns a map of comments attached to their nearest AST nodes by position.
 */

import type { SchemaAST, Token } from '../types';

/**
 * Map of comment attachments.
 * Keys are node identifier strings:
 * - `'top'` — file-level header comments (before first declaration)
 * - `'bottom'` — EOF trailing comments (after last declaration)
 * - `'model:Name'` — model-level comments
 * - `'object:Name'` — object-level comments
 * - `'enum:Name'` — enum-level comments
 * - `'literal:Name'` — literal-level comments
 * - `'tuple:Name'` — tuple-level comments
 * - `'field:BlockName.fieldName'` — field-level comments
 * - `'directive:ModelName.@@name'` — directive-level comments
 * - `'between:N'` — orphan comments that can't be attached to any node
 */
export type CommentMap = Map<string, { leading: Token[]; trailing: Token[] }>;

/** A block-level AST node with position info for attachment */
interface BlockNode {
  key: string;
  startLine: number;
  endLine: number;
  /** Child nodes within this block (fields, directives) */
  children?: { key: string; line: number }[];
}

/** Get or create a comment entry in the map */
function getOrCreate(map: CommentMap, key: string): { leading: Token[]; trailing: Token[] } {
  let entry = map.get(key);
  if (!entry) {
    entry = { leading: [], trailing: [] };
    map.set(key, entry);
  }

  return entry;
}

/** Check if a source line (1-based) is blank */
function isSourceLineBlank(sourceLines: string[], lineNum: number): boolean {
  const idx = lineNum - 1;
  if (idx < 0 || idx >= sourceLines.length) return false;

  return sourceLines[idx]!.trim() === '';
}

/** Collect all block-level AST nodes sorted by start line */
function collectBlocks(ast: SchemaAST): BlockNode[] {
  const blocks: BlockNode[] = [];

  for (const m of ast.models) {
    const children: { key: string; line: number }[] = [];
    for (const f of m.fields) {
      children.push({ key: `field:${m.name}.${f.name}`, line: f.range.start.line });
    }
    if (m.directives) {
      for (const d of m.directives) {
        children.push({ key: `directive:${m.name}.@@${d.name}`, line: d.range.start.line });
      }
    }
    children.sort((a, b) => a.line - b.line);
    blocks.push({
      key: `model:${m.name}`,
      startLine: m.range.start.line,
      endLine: m.range.end.line,
      children: children.length ? children : undefined,
    });
  }

  for (const o of ast.objects) {
    const children: { key: string; line: number }[] = [];
    for (const f of o.fields) {
      children.push({ key: `field:${o.name}.${f.name}`, line: f.range.start.line });
    }
    children.sort((a, b) => a.line - b.line);
    blocks.push({
      key: `object:${o.name}`,
      startLine: o.range.start.line,
      endLine: o.range.end.line,
      children: children.length ? children : undefined,
    });
  }

  for (const e of ast.enums) {
    blocks.push({
      key: `enum:${e.name}`,
      startLine: e.range.start.line,
      endLine: e.range.end.line,
    });
  }

  for (const l of ast.literals) {
    blocks.push({
      key: `literal:${l.name}`,
      startLine: l.range.start.line,
      endLine: l.range.end.line,
    });
  }

  for (const t of ast.tuples) {
    blocks.push({
      key: `tuple:${t.name}`,
      startLine: t.range.start.line,
      endLine: t.range.end.line,
    });
  }

  blocks.sort((a, b) => a.startLine - b.startLine);

  return blocks;
}

/**
 * Determine which comment lines before the first block are "attached" to it.
 * Scans backwards from the block's start line; a blank line breaks attachment.
 * Attached comments become leading of the first block; the rest go to 'top'.
 */
function findAttachedLines(blockStartLine: number, commentLineNums: Set<number>, sourceLines: string[]): Set<number> {
  const attached = new Set<number>();
  for (let l = blockStartLine - 1; l >= 1; l--) {
    if (commentLineNums.has(l)) {
      attached.add(l);
    } else if (isSourceLineBlank(sourceLines, l)) {
      break;
    } else {
      break;
    }
  }

  return attached;
}

/**
 * Attach comments from the token stream to their nearest AST nodes by position.
 *
 * Algorithm:
 * 1. Collect all comment tokens from the token stream
 * 2. Collect all AST nodes with their ranges, sorted by start position
 * 3. For each comment, determine attachment:
 *    - Inside a block → attach to nearest field/directive, or to the block itself
 *    - Before first block, attached (no blank line gap) → leading of first block
 *    - Before first block, separated by blank line → `'top'`
 *    - Between blocks → leading of the next block
 *    - After last block → `'bottom'`
 *    - No attachment target → `'between:N'`
 */
export function attachComments(tokens: Token[], ast: SchemaAST): CommentMap {
  const map: CommentMap = new Map();
  const comments = tokens.filter((t) => t.type === 'comment');

  if (!comments.length) return map;

  const blocks = collectBlocks(ast);

  // No AST nodes — all comments go to 'top'
  if (!blocks.length) {
    const entry = getOrCreate(map, 'top');
    for (const c of comments) {
      entry.leading.push(c);
    }

    return map;
  }

  const firstBlock = blocks[0]!;
  const lastBlock = blocks[blocks.length - 1]!;

  // Determine which pre-first-block comment lines are attached to the first block
  const commentLineNums = new Set(comments.map((c) => c.position.line));
  const sourceLines = ast.source.split('\n');
  const attachedToFirst = findAttachedLines(firstBlock.startLine, commentLineNums, sourceLines);

  let betweenIdx = 0;

  for (const comment of comments) {
    const commentLine = comment.position.line;

    // 1. Inside a block?
    const containingBlock = findContainingBlock(blocks, commentLine);
    if (containingBlock) {
      attachToBlock(map, containingBlock, comment, commentLine);
      continue;
    }

    // 2. Before first block?
    if (commentLine < firstBlock.startLine) {
      if (attachedToFirst.has(commentLine)) {
        getOrCreate(map, firstBlock.key).leading.push(comment);
      } else {
        getOrCreate(map, 'top').leading.push(comment);
      }
      continue;
    }

    // 3. After last block?
    if (commentLine > lastBlock.endLine) {
      getOrCreate(map, 'bottom').leading.push(comment);
      continue;
    }

    // 4. Between blocks → leading of the next block
    const nextBlock = blocks.find((b) => b.startLine > commentLine);
    if (nextBlock) {
      getOrCreate(map, nextBlock.key).leading.push(comment);
      continue;
    }

    // 5. Fallback — orphan comment
    getOrCreate(map, `between:${betweenIdx++}`).leading.push(comment);
  }

  return map;
}

/** Find which block contains the given line */
function findContainingBlock(blocks: BlockNode[], line: number): BlockNode | undefined {
  return blocks.find((b) => line >= b.startLine && line <= b.endLine);
}

/** Attach a comment to a node within or on a block */
function attachToBlock(map: CommentMap, block: BlockNode, comment: Token, commentLine: number): void {
  if (block.children?.length) {
    // Block has field/directive children — try to attach to nearest child

    // Same line as block declaration → trailing on block
    if (commentLine === block.startLine) {
      getOrCreate(map, block.key).trailing.push(comment);

      return;
    }

    // Same line as a child → trailing on that child
    const sameLineChild = block.children.find((c) => c.line === commentLine);
    if (sameLineChild) {
      getOrCreate(map, sameLineChild.key).trailing.push(comment);

      return;
    }

    // Before a child → leading on the next child
    const nextChild = block.children.find((c) => c.line > commentLine);
    if (nextChild) {
      getOrCreate(map, nextChild.key).leading.push(comment);

      return;
    }

    // After all children (before closing brace) → trailing on block
    getOrCreate(map, block.key).trailing.push(comment);

    return;
  }

  // No field-level granularity (enums, literals, tuples)
  if (commentLine === block.startLine) {
    getOrCreate(map, block.key).trailing.push(comment);
  } else {
    getOrCreate(map, block.key).leading.push(comment);
  }
}

/**
 * Detect the predominant comment style used in a token stream.
 *
 * - All comments start with `#` → `'hash'`
 * - All comments start with `//` or `/*` → `'slash'`
 * - Mixed → `'mixed'`
 * - No comments → `'hash'` (default)
 */
export function detectCommentStyle(tokens: Token[]): 'hash' | 'slash' | 'mixed' {
  const comments = tokens.filter((t) => t.type === 'comment');
  if (!comments.length) return 'hash';

  let hasHash = false;
  let hasSlash = false;

  for (const c of comments) {
    const value = c.value.trimStart();
    if (value.startsWith('#')) {
      hasHash = true;
    } else if (value.startsWith('//') || value.startsWith('/*')) {
      hasSlash = true;
    }
  }

  if (hasHash && hasSlash) return 'mixed';
  if (hasSlash) return 'slash';

  return 'hash';
}
