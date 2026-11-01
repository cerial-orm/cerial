import type { CommentMap } from '../../../formatter';
import type { CerialToken } from '../../../types';
import { propertyKey } from './names';
import { splitLines } from './strings';

/** A comment token as `//` lines: the text keeps its spacing, and no line can continue into code. */
export function commentLines(value: string): string[] {
  const text = value.trimStart();
  if (text.startsWith('/*')) {
    const lines = splitLines(text.slice(2).replace(/\*\/$/, '')).map((line) => {
      const trimmed = line.trim();

      return trimmed.startsWith('*') ? trimmed.slice(1).trim() : trimmed;
    });
    while (lines.length && !lines[0]) lines.shift();
    while (lines.length && !lines[lines.length - 1]) lines.pop();

    return lines.length ? lines.map((line) => (line ? `// ${line}` : '//')) : ['//'];
  }
  const rest = text.startsWith('//') ? text.slice(2) : text.startsWith('#') ? text.slice(1) : text;

  return splitLines(rest).map((line) => `//${line.trimEnd()}`);
}

function linesOf(tokens: readonly CerialToken[]): string[] {
  return tokens.flatMap((token) => commentLines(token.value));
}

export interface DeclarationComments {
  /** Printed above the declaration: its own comments, those of its directives, and any that found no place. */
  readonly above: readonly string[];
  readonly fieldAbove: ReadonlyMap<string, readonly string[]>;
  readonly fieldAfter: ReadonlyMap<string, readonly string[]>;
}

export interface CommentTarget {
  /** The key prefix `attachComments` uses for the declaration, such as `model`. */
  readonly kind: string;
  readonly name: string;
  readonly fields: readonly string[];
  readonly directives: readonly string[];
}

/** The comments of one declaration, marking each key it takes in `claimed`. */
export function declarationComments(
  map: CommentMap | undefined,
  target: CommentTarget,
  claimed: Set<string>,
): DeclarationComments {
  const take = (key: string) => {
    claimed.add(key);

    return map?.get(key);
  };
  const block = take(`${target.kind}:${target.name}`);
  const above = [...linesOf(block?.leading ?? []), ...linesOf(block?.trailing ?? [])];
  for (const directive of target.directives) {
    const entry = take(`directive:${target.name}.@@${directive}`);
    above.push(...linesOf(entry?.leading ?? []), ...linesOf(entry?.trailing ?? []));
  }
  const fieldAbove = new Map<string, string[]>();
  const fieldAfter = new Map<string, string[]>();
  for (const field of target.fields) {
    const entry = take(`field:${target.name}.${field}`);
    if (entry?.leading.length) fieldAbove.set(field, linesOf(entry.leading));
    if (entry?.trailing.length) fieldAfter.set(field, linesOf(entry.trailing));
  }

  return { above, fieldAbove, fieldAfter };
}

const ENTRY = /^ {4}\S/;

/**
 * Put the comments into a printed declaration. A field's comments go beside its entry in the fields
 * block; one whose entry is not written (a derived foreign key) goes above the declaration instead.
 */
export function applyComments(text: string, comments: DeclarationComments): string {
  const { fieldAbove, fieldAfter } = comments;
  const above = [...comments.above];
  const rows = text.split('\n');
  const open = rows.indexOf('  {');
  const close = open === -1 ? -1 : rows.indexOf('  },', open);
  const placed = new Set<string>();
  const out: string[] = [];
  const names = [...new Set([...fieldAbove.keys(), ...fieldAfter.keys()])];

  if (open !== -1 && close !== -1 && names.length) {
    const starts: number[] = [];
    for (let i = open + 1; i < close; i++) if (ENTRY.test(rows[i]!)) starts.push(i);
    out.push(...rows.slice(0, open + 1));
    starts.forEach((start, n) => {
      const end = (starts[n + 1] ?? close) - 1;
      const name = names.find((candidate) => rows[start]!.startsWith(`    ${propertyKey(candidate)}: `));
      const entry = rows.slice(start, end + 1);
      if (name) {
        placed.add(name);
        out.push(...(fieldAbove.get(name) ?? []).map((line) => `    ${line}`));
        const after = fieldAfter.get(name) ?? [];
        if (after.length) entry[entry.length - 1] += ` ${after[0]}`;
        out.push(...entry, ...after.slice(1).map((line) => `    ${line}`));
      } else out.push(...entry);
    });
    out.push(...rows.slice(close));
  } else out.push(...rows);

  for (const name of names) {
    if (placed.has(name)) continue;
    above.push(...(fieldAbove.get(name) ?? []), ...(fieldAfter.get(name) ?? []));
  }

  return [...above, ...out].join('\n');
}

/** The comments that belong to no declaration: the header, the footer, and any left unclaimed. */
export function fileComments(
  map: CommentMap | undefined,
  claimed: ReadonlySet<string>,
): { top: string[]; bottom: string[] } {
  const top = linesOf(map?.get('top')?.leading ?? []);
  const bottom: string[] = [];
  for (const [key, entry] of map ?? []) {
    if (key === 'top' || claimed.has(key)) continue;
    bottom.push(...linesOf(entry.leading), ...linesOf(entry.trailing));
  }

  return { top, bottom };
}
