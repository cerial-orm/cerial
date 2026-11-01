const NAMED_ESCAPES: Readonly<Record<string, string>> = {
  '\\': '\\\\',
  '\n': '\\n',
  '\r': '\\r',
};

// Controls (C0, DEL, C1), the line and paragraph separators, and an unpaired surrogate. A lone surrogate
// written to a UTF-8 file is replaced by U+FFFD, so it is spelled out instead of left to the encoder.
const NEEDS_ESCAPE = /[\\'"\p{Cc}\p{Zl}\p{Zp}\p{Cs}]/gu;

/**
 * A value as a JavaScript string literal. `generate` executes the module this ends up in, so every schema
 * string that reaches the output goes through here and nothing is interpolated raw. Quotes follow the
 * formatter: single, unless the value holds more single quotes than double. Inside either kind a backtick
 * and `${` are inert.
 */
export function quote(value: string): string {
  const delimiter = value.split("'").length > value.split('"').length ? '"' : "'";
  const escaped = value.replace(NEEDS_ESCAPE, (char) => {
    if (char === delimiter) return `\\${char}`;
    if (char === "'" || char === '"') return char;
    const named = NAMED_ESCAPES[char];
    if (named !== undefined) return named;

    return `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
  });

  return `${delimiter}${escaped}${delimiter}`;
}

// JavaScript ends a `//` comment at each of these, and U+2028 and U+2029 are the two a text editor hides
const LINE_BREAK = /\r\n|[\n\r\p{Zl}\p{Zp}]/u;

/** Text split at every character that ends a `//` comment, so each piece can be written as a comment of its own. */
export function splitLines(text: string): string[] {
  return text.split(LINE_BREAK);
}
