/**
 * Position conversion utilities between cerial's 1-indexed positions
 * and LSP's 0-indexed positions.
 *
 * Cerial parser: line = 1-indexed, column = 0-indexed, offset = byte offset
 * LSP protocol: line = 0-indexed, character = 0-indexed
 */

/** Cerial source position (from parser AST) */
interface CerialPosition {
  line: number;
  column: number;
  offset: number;
}

/** LSP position */
interface LspPosition {
  line: number;
  character: number;
}

/** Cerial source range (start + end positions) */
interface CerialRange {
  start: CerialPosition;
  end: CerialPosition;
}

/** LSP range */
interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

/**
 * Convert a cerial parser position to an LSP position.
 *
 * Cerial lines are 1-indexed, LSP lines are 0-indexed.
 * Cerial columns are 0-indexed, LSP characters are 0-indexed (same).
 */
export function cerialToLsp(pos: CerialPosition): LspPosition {
  return {
    line: pos.line - 1,
    character: pos.column,
  };
}

/**
 * Convert an LSP position to a cerial parser position.
 *
 * LSP lines are 0-indexed, cerial lines are 1-indexed.
 * LSP characters are 0-indexed, cerial columns are 0-indexed (same).
 * Offset is set to 0 (unknown — would require source text to compute).
 */
export function lspToCerial(pos: LspPosition): CerialPosition {
  return {
    line: pos.line + 1,
    column: pos.character,
    offset: 0,
  };
}

/**
 * Convert a cerial source range to an LSP range.
 */
export function cerialRangeToLsp(range: CerialRange): LspRange {
  return {
    start: cerialToLsp(range.start),
    end: cerialToLsp(range.end),
  };
}

/**
 * Convert an LSP range to a cerial source range.
 */
export function lspRangeToCerial(range: LspRange): CerialRange {
  return {
    start: lspToCerial(range.start),
    end: lspToCerial(range.end),
  };
}
