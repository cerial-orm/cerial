/**
 * Parity manifest coverage.
 *
 * The manifest lists every DSL construct; this test parses the e2e schema corpus and checks that
 * each `corpus` entry is exercised by some schema. Constructs the corpus lacks are NAMED, not counted.
 *
 * A named gap is not a failure. The gaps live in `parity-known-gaps.ts`. The default run passes when the computed gaps equal that list, and fails on
 * drift in either direction:
 * - a gap that is not listed: a construct was added to the manifest, or removed from the corpus,
 *   without anyone deciding it is a gap;
 * - a listed gap that is now covered: close it by deleting the entry.
 *
 * `PARITY_STRICT=1 bun test tests/generators/parity-manifest.test.ts` is the real completeness gate:
 * it fails while any gap remains and prints each one by construct id. It fails today by design.
 */

import { describe, expect, test } from 'bun:test';
import {
  COMPOSITE_DIRECTIVE_CONSTRUCTS,
  DECLARATION_CONSTRUCTS,
  LITERAL_VARIANT_CONSTRUCTS,
  ON_DELETE_CONSTRUCTS,
  PARITY_MANIFEST,
} from '../../src/parity';
import { computeGaps, formatGaps, loadCorpus } from './parity-corpus';
import { KNOWN_GAPS } from './parity-known-gaps';

const corpus = loadCorpus();
const gaps = computeGaps(corpus);
const gapIds = gaps.map((g) => g.id);
const manifestIds = PARITY_MANIFEST.map((e) => e.id as string);

describe('parity manifest shape', () => {
  test('ids are unique and dotted lowercase segments', () => {
    expect(new Set(manifestIds).size).toBe(manifestIds.length);
    for (const id of manifestIds) expect(id).toMatch(/^[a-z]+(\.[A-Za-z0-9+-]+)+$/);
  });

  test('every checklist item 1 to 123 is claimed by an entry', () => {
    const claimed = new Set(PARITY_MANIFEST.flatMap((e) => e.items));
    const missing = Array.from({ length: 123 }, (_, i) => i + 1).filter((n) => !claimed.has(n));
    expect(missing).toEqual([]);
    expect([...claimed].filter((n) => n < 1 || n > 123)).toEqual([]);
  });

  test('the three items the critic found missing are present', () => {
    const byCritic = (n: number) =>
      PARITY_MANIFEST.filter((e) => 'critic' in e && e.critic === n).map((e) => e.id as string);
    expect(byCritic(5)).toEqual(['extends.tuple.pick-name', 'extends.tuple.omit-name']);
    expect(byCritic(6)).toEqual(['tuple.element.optional-rejected']);
    expect(byCritic(13)).toEqual(['fidelity.element-decorators-omitted']);
  });

  test('AST cross-check maps point at real manifest entries', () => {
    const mapped = [
      ...Object.values(LITERAL_VARIANT_CONSTRUCTS),
      ...Object.values(COMPOSITE_DIRECTIVE_CONSTRUCTS),
      ...Object.values(ON_DELETE_CONSTRUCTS),
      ...Object.values(DECLARATION_CONSTRUCTS),
    ];
    for (const id of mapped) expect(manifestIds).toContain(id);
  });
});

describe('parity corpus', () => {
  test('every schema parses without error', () => {
    expect(corpus.errors).toEqual([]);
    expect(corpus.files.length).toBeGreaterThan(0);
  });

  test('the known-gap list names only corpus constructs, once each', () => {
    const corpusIds = PARITY_MANIFEST.filter((e) => e.scope === 'corpus').map((e) => e.id as string);
    expect(new Set(KNOWN_GAPS).size).toBe(KNOWN_GAPS.length);
    for (const id of KNOWN_GAPS) expect(corpusIds).toContain(id);
  });

  test('gaps match the known-gap list (a named gap is not a failure, drift is)', () => {
    const known = new Set<string>(KNOWN_GAPS);
    const unlisted = gaps.filter((g) => !known.has(g.id));
    const closed = KNOWN_GAPS.filter((id) => !gapIds.includes(id));

    console.log(`parity: ${corpus.files.length} schemas, ${gaps.length} named gaps\n${formatGaps(gaps)}`);

    expect(unlisted.map((g) => g.id)).toEqual([]);
    expect(closed).toEqual([]);
  });

  test.if(process.env.PARITY_STRICT === '1')('every corpus construct is exercised (strict)', () => {
    expect(gapIds, `constructs no schema exercises:\n${formatGaps(gaps)}`).toEqual([]);
  });
});
