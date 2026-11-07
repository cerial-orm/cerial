import { CerialMigrationError } from '../errors';
import { escapeControl } from '../utils/safe-text';

/**
 * Everything a lexer may take as the end of a `--` comment: every control character except the tab
 * (LF, CR, VT, FF, NEL and the rest of C0/C1) plus the Unicode line and paragraph separators.
 * Wider than the strict list so a lexer difference cannot turn a comment tail into a statement.
 */
const HAS_LINE_TERMINATOR = /(?!\t)[\p{Cc}\p{Zl}\p{Zp}]/u;

/** Renders every line terminator in free text visibly, so a reason built from raw names stays on one line. */
export const sanitiseReason = (text: string): string => escapeControl(text);

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
