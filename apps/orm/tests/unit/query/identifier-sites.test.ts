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
