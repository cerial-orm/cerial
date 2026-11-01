/**
 * Prints a builder call the way `oxfmt` lays it out with the repo's options, so an emitted module is
 * already formatted and no formatter has to run at conversion time. It covers the shapes a declaration
 * takes (strings, objects, arrays) and mirrors the formatter's call-argument rules: the whole call on one
 * line when it fits, the last argument opened in place when that is allowed, else one argument per line.
 */

/** The `printWidth` of `.oxfmtrc.json`. */
export const PRINT_WIDTH = 120;

export interface Entry {
  readonly key: string;
  readonly value: Layout;
  /** `//` lines written above the entry. */
  readonly above?: readonly string[];
  /** `//` lines written after the entry; the first shares its line. */
  readonly after?: readonly string[];
}

export interface ObjectLayout {
  readonly kind: 'object';
  readonly entries: readonly Entry[];
  /** Written one entry per line whenever the call's arguments are split across lines. */
  readonly open: boolean;
}

export interface ArrayLayout {
  readonly kind: 'array';
  readonly items: readonly Layout[];
}

/** A string is printed as given. */
export type Layout = string | ObjectLayout | ArrayLayout;

export function objectOf(entries: readonly Entry[], open = false): ObjectLayout {
  return { kind: 'object', entries, open };
}

export function arrayOf(items: readonly Layout[]): ArrayLayout {
  return { kind: 'array', items };
}

function kindOf(layout: Layout): 'string' | 'object' | 'array' {
  return typeof layout === 'string' ? 'string' : layout.kind;
}

function size(layout: Layout): number {
  if (typeof layout === 'string') return 0;

  return layout.kind === 'object' ? layout.entries.length : layout.items.length;
}

/** The formatter always breaks an array of two or more objects (or arrays) that each hold more than one member. */
function alwaysBreaks(layout: ArrayLayout): boolean {
  const { items } = layout;
  if (items.length < 2) return false;
  const first = kindOf(items[0]!);

  return first !== 'string' && items.every((item) => kindOf(item) === first && size(item) > 1);
}

/** The layout on one line, or undefined when something in it has to span lines. */
function flat(layout: Layout): string | undefined {
  if (typeof layout === 'string') return layout;
  if (layout.kind === 'array') {
    if (alwaysBreaks(layout)) return undefined;
    const parts = layout.items.map(flat);

    return parts.some((part) => part === undefined) ? undefined : `[${parts.join(', ')}]`;
  }
  if (!layout.entries.length) return '{}';
  if (layout.entries.some((entry) => entry.above?.length || entry.after?.length)) return undefined;
  const parts = layout.entries.map((entry) => {
    const value = flat(entry.value);

    return value === undefined ? undefined : `${entry.key}: ${value}`;
  });

  return parts.some((part) => part === undefined) ? undefined : `{ ${parts.join(', ')} }`;
}

/** Flat when it fits from `column` with `trailing` characters after it, else one member per line. */
function render(layout: Layout, indent: number, column: number, trailing: number): string {
  const line = flat(layout);
  if (line !== undefined && column + line.length + trailing <= PRINT_WIDTH) return line;

  return expanded(layout, indent);
}

/** The layout one member per line, its closing bracket at `indent`. */
function expanded(layout: Layout, indent: number): string {
  if (typeof layout === 'string') return layout;
  const closing = ' '.repeat(indent);
  const pad = ' '.repeat(indent + 2);
  if (layout.kind === 'array') {
    if (!layout.items.length) return '[]';
    const rows = layout.items.map((item) => `${pad}${render(item, indent + 2, indent + 2, 1)},`);

    return `[\n${rows.join('\n')}\n${closing}]`;
  }
  if (!layout.entries.length) return '{}';
  const rows = layout.entries.flatMap((entry) => {
    const head = `${entry.key}: `;
    const value = render(entry.value, indent + 2, indent + 2 + head.length, 1);
    const after = entry.after ?? [];
    const row = `${pad}${head}${value},${after.length ? ` ${after[0]}` : ''}`;

    return [
      ...(entry.above ?? []).map((line) => `${pad}${line}`),
      row,
      ...after.slice(1).map((line) => `${pad}${line}`),
    ];
  });

  return `{\n${rows.join('\n')}\n${closing}}`;
}

/** Whether the last argument can stay open on the call's line: a filled object or array, unlike the one before it. */
function huggable(args: readonly Layout[]): boolean {
  const last = args[args.length - 1]!;
  if (kindOf(last) === 'string' || !size(last)) return false;
  const before = args[args.length - 2];

  return before === undefined || kindOf(before) !== kindOf(last);
}

/**
 * A call as the text after `=` in `const X = <call>;`. `prefixWidth` is what precedes it on its first
 * line, and the closing `;` is counted.
 */
/** An import statement, one name per line when it does not fit. */
export function printImport(names: readonly string[], specifier: string): string {
  const line = `import { ${names.join(', ')} } from ${specifier};`;
  if (line.length <= PRINT_WIDTH) return line;

  return `import {\n${names.map((name) => `  ${name},\n`).join('')}} from ${specifier};`;
}

export function printCall(prefixWidth: number, callee: string, args: readonly Layout[]): string {
  const parts = args.map(flat);
  if (parts.every((part) => part !== undefined)) {
    const line = `${callee}(${parts.join(', ')})`;
    if (prefixWidth + line.length + 1 <= PRINT_WIDTH) return line;
  }

  const rest = parts.slice(0, -1);
  if (huggable(args) && rest.every((part) => part !== undefined)) {
    const last = args[args.length - 1]!;
    const head = `${callee}(${[...rest, ''].join(', ')}`;
    const opener = kindOf(last) === 'array' ? '[' : '{';
    if (prefixWidth + head.length + opener.length <= PRINT_WIDTH) return `${head}${expanded(last, 0)})`;
  }

  const rows = args.map((arg) => {
    const open = typeof arg !== 'string' && arg.kind === 'object' && arg.open;

    return `  ${open ? expanded(arg, 2) : render(arg, 2, 2, 1)},`;
  });

  return `${callee}(\n${rows.join('\n')}\n)`;
}
