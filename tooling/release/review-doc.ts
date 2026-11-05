// Parses the security review document: a frontmatter block and pipe tables under `##` headings.
// No markdown library: the document is a ledger, and a table row is the only structure the gate reads.
//
// Format, in the order CONTRIBUTING.md ranks the passes:
//   frontmatter: base, ext_base, reviewed_head, scope (comma separated, or one `- path` per line)
//   ## Commits   sha | subject | passes
//   ## Sites     key | class | reason
//   ## Passes    pass | statement
//   ## Findings  id | pass | status | payload | output | fix | test | accepted [| reviewer]
//   ## Re-fires  key | payload | output
//
// Two reviewers' findings are merged into one table. Ids must be unique across both, so each reviewer
// uses its own prefix, and an optional `reviewer` column records who raised it. A literal pipe inside a
// cell (site keys hold union types and `||`) is written `\|`.

export const PASSES = [
  'scope',
  'identifiers',
  'raw-hatch',
  'validation',
  'writes',
  'discovery',
  'dependencies',
  'output',
] as const;

export type Pass = (typeof PASSES)[number];

export type Row = Readonly<Record<string, string>>;

export interface Table {
  readonly headers: readonly string[];
  readonly rows: readonly Row[];
}

export interface ReviewDoc {
  readonly fields: Readonly<Record<string, string>>;
  readonly lists: Readonly<Record<string, readonly string[]>>;
  /** Tables by lower-cased section heading. */
  readonly tables: ReadonlyMap<string, Table>;
}

export function isPass(name: string): name is Pass {
  return (PASSES as readonly string[]).includes(name);
}

/** Splits one table line on unescaped pipes; `\|` becomes a literal pipe inside the cell. */
export function splitCells(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === '\\' && line[i + 1] === '|') {
      current += '|';
      i++;
    } else if (char === '|') {
      cells.push(current);
      current = '';
    } else current += char;
  }
  cells.push(current);
  if (line.trim().startsWith('|')) cells.shift();
  if (cells.length && cells[cells.length - 1]!.trim() === '' && line.trimEnd().endsWith('|')) cells.pop();

  return cells.map((cell) => cell.trim());
}

/** The cell without one pair of wrapping backticks, for cells that hold a path, a key or a hash. */
export function unwrap(cell: string): string {
  return cell.length > 1 && cell.startsWith('`') && cell.endsWith('`') ? cell.slice(1, -1).trim() : cell;
}

function parseTable(lines: readonly string[]): Table | undefined {
  const start = lines.findIndex((line) => line.trim().startsWith('|'));
  if (start < 0) return undefined;
  const headers = splitCells(lines[start]!).map((header) => header.toLowerCase());
  const rows: Row[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim().startsWith('|')) break;
    const cells = splitCells(line);
    if (cells.every((cell) => /^:?-{1,}:?$/.test(cell))) continue;
    rows.push(Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
  }

  return { headers, rows };
}

function parseFrontmatter(text: string): Pick<ReviewDoc, 'fields' | 'lists'> & { body: string } {
  const fields: Record<string, string> = {};
  const lists: Record<string, string[]> = {};
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { fields, lists, body: text };
  let listKey: string | undefined;
  for (const line of match[1]!.split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      (lists[listKey] ??= []).push(unwrap(item[1]!.trim()));
      continue;
    }
    const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!pair) continue;
    listKey = pair[1]!;
    fields[listKey] = pair[2]!.trim();
  }

  return { fields, lists, body: text.slice(match[0].length) };
}

export function parseReview(text: string): ReviewDoc {
  const { fields, lists, body } = parseFrontmatter(text);
  const tables = new Map<string, Table>();
  let heading: string | undefined;
  let buffer: string[] = [];
  const flush = (): void => {
    if (!heading) return;
    const table = parseTable(buffer);
    if (table) tables.set(heading, table);
  };
  for (const line of body.split(/\r?\n/)) {
    const next = /^##\s+(.+?)\s*$/.exec(line);
    if (next) {
      flush();
      heading = next[1]!.toLowerCase();
      buffer = [];
    } else buffer.push(line);
  }
  flush();

  return { fields, lists, tables };
}

/** The scope paths: a list in the frontmatter, or one comma separated line. */
export function scopeOf(doc: ReviewDoc): string[] {
  const listed = doc.lists.scope ?? [];
  if (listed.length) return [...listed];

  return (doc.fields.scope ?? '')
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((path) => unwrap(path.trim()))
    .filter(Boolean);
}
