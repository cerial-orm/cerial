import { CerialMigrationError } from '../errors';
import type { FieldPath, FieldPathSegment } from './types';

/**
 * Characters a backtick-quoted name must escape: the two that end the quote, and every control
 * character plus the Unicode line and paragraph separators, because SurrealDB ends a `--` comment
 * on LF, CR, NEL, LS and PS and a raw one would turn a trailing comment into a second statement.
 */
const NEEDS_ESCAPE = /[\\`\p{Cc}\p{Zl}\p{Zp}]/gu;

function escapeChar(char: string): string {
  if (char === '\\') return '\\\\';
  if (char === '`') return '\\`';
  if (char === '\n') return '\\n';
  if (char === '\r') return '\\r';

  return `\\u{${char.codePointAt(0)!.toString(16)}}`;
}

/** Quotes one identifier in backticks. Every name that reaches migration text goes through here. */
export function quoteIdent(name: string): string {
  return `\`${name.replace(NEEDS_ESCAPE, escapeChar)}\``;
}

/** Quotes each named segment and writes an element step as a bare `*`. */
export function quoteFieldPath(path: FieldPath): string {
  return path.map((segment) => (typeof segment === 'string' ? quoteIdent(segment) : '*')).join('.');
}

/** Short escapes the server writes when it renders a name; the quoter emits only `\\u{..}` for these. */
const SERVER_ESCAPES: Readonly<Record<string, string>> = { n: '\n', r: '\r', t: '\t', f: '\f', b: '\b' };

function fail(rendered: string, reason: string): never {
  throw new CerialMigrationError(`Cannot read field idiom ${JSON.stringify(rendered)}: ${reason}`);
}

/** Reads a backticked segment starting after its opening backtick; returns the name and the index after the closing one. */
function readQuoted(rendered: string, start: number): [string, number] {
  let name = '';
  let i = start;
  while (i < rendered.length) {
    const char = rendered[i]!;
    if (char === '`') return [name, i + 1];
    if (char !== '\\') {
      name += char;
      i += 1;
      continue;
    }

    const next = rendered[i + 1];
    if (next === '\\' || next === '`') {
      name += next;
      i += 2;
    } else if (next && next in SERVER_ESCAPES) {
      name += SERVER_ESCAPES[next];
      i += 2;
    } else if (next === 'u' && rendered[i + 2] === '{') {
      const end = rendered.indexOf('}', i + 3);
      const hex = end === -1 ? '' : rendered.slice(i + 3, end);
      if (!/^[0-9a-fA-F]{1,6}$/.test(hex)) fail(rendered, 'malformed unicode escape');
      const code = parseInt(hex, 16);
      if (code > 0x10ffff) fail(rendered, 'unicode escape out of range');
      name += String.fromCodePoint(code);
      i = end + 1;
    } else {
      fail(rendered, 'unknown escape sequence');
    }
  }

  return fail(rendered, 'unterminated backtick');
}

/**
 * Reads an idiom as the server renders it (`a`, `` `o y`.z ``, `arr.*`) into segments, so a literal
 * `.` inside a quoted name stays part of that name. A bare `*` is an element step; a quoted `*` is a name.
 */
export function parseFieldIdiom(rendered: string): FieldPath {
  const segments: FieldPathSegment[] = [];
  let i = 0;
  while (true) {
    if (rendered[i] === '`') {
      const [name, after] = readQuoted(rendered, i + 1);
      segments.push(name);
      i = after;
    } else {
      let end = rendered.indexOf('.', i);
      if (end === -1) end = rendered.length;
      const bare = rendered.slice(i, end);
      if (!bare) fail(rendered, 'empty segment');
      if (bare.includes('`')) fail(rendered, 'backtick inside a bare segment');
      segments.push(bare === '*' ? { element: true } : bare);
      i = end;
    }

    if (i === rendered.length) return segments;
    if (rendered[i] !== '.') fail(rendered, 'expected "." after a segment');
    i += 1;
  }
}
