/**
 * Pins the class 5 ("needs review") set of the query-text interpolation inventory
 *
 * Class 5 was a caller string reaching query text with neither a repo validator nor repo-added
 * backticks on at least one path. All 26 sites were driven with a payload against a live instance
 * and closed:
 *
 *   5a orderBy direction under a @flexible object   validated: asc/desc at any depth (select-validator.ts)
 *   5b nested reverse-create key and its regexp     rejected: keys checked against the target model (nested-builder.ts)
 *   5c record id text escaped only by the driver    bound as a variable at every site, never interpolated
 *   5d two dead nested-builder helpers              deleted with their barrel exports
 *   5e exported formatValue                         backslash escaped, dates parsed, non-scalars quoted
 *
 * The negative tests are in tests/e2e/negative/hostile-matrix.test.ts and the unit tests beside this
 * file. A new entry here means a new unclassified interpolation: close it, do not list it.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { countSites, findSites, inScope, unlistedSites } from './interpolation-sites';
import allowlist from './interpolation-allowlist.json';

interface ReviewSite {
  /** Path from apps/orm */
  readonly file: string;
  /** The line's text, trimmed */
  readonly snippet: string;
  readonly tag: '5a' | '5b' | '5c' | '5d' | '5e';
  readonly why: string;
}

const NEEDS_REVIEW: readonly ReviewSite[] = [];

const ORM_ROOT = resolve(import.meta.dir, '../../..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);

    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

/** A template placeholder that puts a record id's own text into a string: the shape that reached the parser unescaped. */
const RECORD_ID_TEXT = /\$\{[^}]*\b(?:recordId|rid)\b[^}]*\}/i;
const BOUND_NAMES = /placeholder|Ref\b|recordRef/;

function recordIdInterpolations(source: string): string[] {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !line.startsWith('*') && !line.startsWith('//'))
    .filter((line) => RECORD_ID_TEXT.test(line) && !BOUND_NAMES.test(line));
}

const ALLOWED: Readonly<Record<string, number>> = allowlist;

function scopedFiles(): Array<{ path: string; source: string }> {
  return sourceFiles(join(ORM_ROOT, 'src'))
    .map((file) => relative(ORM_ROOT, file))
    .filter(inScope)
    .map((path) => ({ path, source: readFileSync(join(ORM_ROOT, path), 'utf-8') }));
}

describe('query-text interpolation ratchet', () => {
  test('every interpolation in the scanned sources is on the allowlist', () => {
    const files = scopedFiles();

    // A scan over nothing would pass; the scope holds dozens of files
    expect(files.length).toBeGreaterThan(40);
    // A failure lists the new site. Classify it as a bound placeholder, an internal constant, a validated
    // identifier or a quoted identifier, then add its key here. If it is none of those, close it instead.
    expect(unlistedSites(files, ALLOWED)).toEqual([]);
  });

  test('the allowlist holds no entry the sources no longer produce', () => {
    const found = countSites(scopedFiles());
    const stale = Object.entries(ALLOWED)
      .filter(([key, count]) => (found[key] ?? 0) < count)
      .map(([key, count]) => `${key} (listed ${count}, found ${found[key] ?? 0})`);

    expect(stale).toEqual([]);
  });

  /* oxlint-disable no-template-curly-in-string */
  // The inputs are source text containing template placeholders, scanned literally
  describe('the scan', () => {
    const keysOf = (source: string): string[] => findSites('src/query/x.ts', source).map((site) => site.key);

    test('reports a template placeholder with its file, function and expression', () => {
      const source = 'function build(key: string) {\n  return `SELECT ${key} FROM t`;\n}';

      expect(keysOf(source)).toEqual(['src/query/x.ts::build::template::key']);
    });

    test('reports a method under its class and an arrow function under its variable', () => {
      expect(keysOf('class B { run(k: string) { return `a ${k}`; } }')).toEqual(['src/query/x.ts::B.run::template::k']);
      expect(keysOf('const make = (k: string) => `a ${k}`;')).toEqual(['src/query/x.ts::make::template::k']);
    });

    test('reports each operand of a concatenation that holds a string literal, once', () => {
      expect(keysOf("function f(a: string, b: string) { return 'x ' + a + ' y ' + b; }")).toEqual([
        'src/query/x.ts::f::concat::a',
        'src/query/x.ts::f::concat::b',
      ]);
    });

    test('ignores arithmetic, bound placeholders written as plain strings, comments and string contents', () => {
      expect(keysOf('function f(a: number) { return a + 1; }')).toEqual([]);
      expect(keysOf("const s = 'SELECT ${key} FROM t';")).toEqual([]);
      expect(keysOf('// `SELECT ${key}`\n/* `${key}` */ const n = 1;')).toEqual([]);
    });

    test('ignores messages built for errors, throws and the console', () => {
      expect(keysOf('function f(k: string) { throw new CerialQueryError(`bad ${k}`); }')).toEqual([]);
      expect(keysOf('function f(k: string) { throw make(`bad ${k}`); }')).toEqual([]);
      expect(keysOf('function f(k: string) { console.warn(`odd ${k}`); }')).toEqual([]);
    });

    test('keys do not depend on line position or formatting', () => {
      const compact = 'function f(k: string) { return `a ${k.trim()}`; }';
      const moved = '\n\n// moved\nfunction f(k: string) {\n  return `a ${\n    k.trim()\n  }`;\n}';

      expect(keysOf(moved)).toEqual(keysOf(compact));
    });

    test('a new interpolation, a changed expression and a repeated one are each unlisted', () => {
      const file = (source: string): Array<{ path: string; source: string }> => [{ path: 'src/query/x.ts', source }];
      const base = 'function f(a: string) { return `x ${a}`; }';
      const allowed = countSites(file(base));

      expect(unlistedSites(file(base), allowed)).toEqual([]);
      expect(unlistedSites(file('function f(a: string) { return `x ${a} ${a}`; }'), allowed)).toHaveLength(1);
      expect(unlistedSites(file('function f(a: string) { return `x ${a.trim()}`; }'), allowed)).toHaveLength(1);
      expect(unlistedSites(file('function g(a: string) { return `x ${a}`; }'), allowed)).toHaveLength(1);
      expect(unlistedSites(file(`${base}\nconst extra = (k: string) => \`y \${k}\`;`), allowed)).toHaveLength(1);
    });

    test('the scope matches the inventory and leaves out validators and the data transformer', () => {
      expect(inScope('src/query/builders/select-builder.ts')).toBe(true);
      expect(inScope('src/generators/migrations/define-generator.ts')).toBe(true);
      expect(inScope('src/generators/client/template.ts')).toBe(true);
      expect(inScope('src/query/validators/where-validator.ts')).toBe(false);
      expect(inScope('src/query/transformers/data-transformer.ts')).toBe(false);
      expect(inScope('src/generators/types/where-generator.ts')).toBe(false);
    });
  });
  /* oxlint-enable no-template-curly-in-string */
});

describe('query-text interpolation inventory: class 5 sites', () => {
  test('no site is left unclassified', () => {
    expect(NEEDS_REVIEW).toEqual([]);
  });

  test('no src/query file interpolates a record id into query text', () => {
    const files = sourceFiles(join(ORM_ROOT, 'src/query'));
    const hits = files.flatMap((file) =>
      recordIdInterpolations(readFileSync(file, 'utf-8')).map((line) => `${relative(ORM_ROOT, file)}: ${line}`),
    );

    // A scan over nothing would pass; the tree has dozens of files
    expect(files.length).toBeGreaterThan(30);
    expect(hits).toEqual([]);
  });

  /* oxlint-disable no-template-curly-in-string */
  // The inputs are source text containing template placeholders, scanned literally
  test('the scan recognises the shapes it exists to catch', () => {
    expect(recordIdInterpolations('text: `DELETE ${recordId.toString()} RETURN NONE`')).toHaveLength(1);
    expect(recordIdInterpolations('`FROM ONLY ${recordId}`')).toHaveLength(1);
    expect(recordIdInterpolations('`FROM ONLY ${idBinding.placeholder}`')).toHaveLength(0);
    expect(recordIdInterpolations('// ${recordId.toString()} in a comment')).toHaveLength(0);
  });
  /* oxlint-enable no-template-curly-in-string */
});
