import { CerialMigrationError } from '../errors';

/**
 * Everything a lexer may take as the end of a `--` comment: every control character except the tab
 * (LF, CR, VT, FF, NEL and the rest of C0/C1) plus the Unicode line and paragraph separators.
 * Wider than the strict list so a lexer difference cannot turn a comment tail into a statement.
 */
const LINE_TERMINATOR = /(?!\t)[\p{Cc}\p{Zl}\p{Zp}]/gu;
const HAS_LINE_TERMINATOR = /(?!\t)[\p{Cc}\p{Zl}\p{Zp}]/u;

function renderTerminator(char: string): string {
  if (char === '\n') return '\\n';
  if (char === '\r') return '\\r';

  return `\\u{${char.codePointAt(0)!.toString(16)}}`;
}

/** Renders every line terminator in free text visibly, so a reason built from raw names stays on one line. */
export function sanitiseReason(text: string): string {
  return text.replace(LINE_TERMINATOR, renderTerminator);
}

/**
 * Writes `text` as a single `--` comment line. Throws on a raw line terminator: text that went
 * through `quoteIdent` or `sanitiseReason` has none, so one here means something skipped them.
 */
export function commentOut(text: string): string {
  if (HAS_LINE_TERMINATOR.test(text)) {
    throw new CerialMigrationError(
      'Cannot write a comment holding a raw line terminator; quote or sanitise the text first',
    );
  }

  return `-- ${text}`;
}
