/**
 * Everything a lexer may take as the end of a line: every control character except the tab (LF, CR,
 * VT, FF, NEL, ESC, BEL and the rest of C0/C1) plus the Unicode line and paragraph separators.
 */
const CONTROL = /(?!\t)[\p{Cc}\p{Zl}\p{Zp}]/gu;
const CONTROL_KEEP_LF = /(?![\t\n])[\p{Cc}\p{Zl}\p{Zp}]/gu;

function renderControl(char: string): string {
  if (char === '\n') return '\\n';
  if (char === '\r') return '\\r';

  return `\\u{${char.codePointAt(0)!.toString(16)}}`;
}

/**
 * Renders control characters in caller- or server-supplied text visibly, so a key echoed into an error
 * message or a terminal line cannot forge a log line or carry an escape sequence. Text without one is
 * returned unchanged. `keepNewlines` leaves LF alone for multi-line terminal output; CR is still
 * escaped so it cannot overwrite a line.
 */
export function escapeControl(text: string, options?: { readonly keepNewlines?: boolean }): string {
  return text.replace(options?.keepNewlines ? CONTROL_KEEP_LF : CONTROL, renderControl);
}

/** For the text a CLI command writes to stderr: control bytes escaped, line breaks kept. */
export const escapeForTerminal = (text: string): string => escapeControl(text, { keepNewlines: true });
