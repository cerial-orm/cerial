/**
 * The subset of the corpus the conversion proofs run over. `CORPUS_EXCLUSIONS` is expected to stay empty, so the
 * lossy fixtures, not corpus exclusions, are what prove the lossy rows.
 */
import { describe, expect, test } from 'bun:test';
import { LOSSY_CASES } from '../../src/cli/convert/lossy-cases';
import { convertCorpus, CORPUS_EXCLUSIONS, staleExclusions, subsetOf, unknownExclusions } from './convert-corpus';
import { loadCorpus } from './parity-corpus';

const FILES = ['a.cerial', 'dir/b.cerial', 'c.cerial'];
const ID = LOSSY_CASES[0]!.id;

describe('the corpus subset, with no corpus exclusions: the lossy fixtures are what prove the lossy rows', () => {
  test('the exclusion map is empty', () => {
    expect(CORPUS_EXCLUSIONS).toEqual({});
  });

  test('every corpus file is in the subset, enumerated through loadCorpus', async () => {
    const corpus = loadCorpus();
    const subset = await convertCorpus();
    expect(corpus.files.length).toBeGreaterThan(0);
    expect(subset.files).toEqual(corpus.files);
    expect(subset.excluded).toEqual({});
  });
});

describe('a new corpus schema joins with no edit', () => {
  test('files not named in the map are kept, in order', () => {
    expect(subsetOf([...FILES, 'new.cerial'], { 'a.cerial': ID })).toEqual(['dir/b.cerial', 'c.cerial', 'new.cerial']);
  });
});

describe('exclusion checks fail on bad input', () => {
  test('a valid exclusion passes', () => {
    expect(unknownExclusions(FILES, { 'a.cerial': ID })).toEqual([]);
  });

  test('a file the corpus does not have fails', () => {
    const problems = unknownExclusions(FILES, { 'gone.cerial': ID });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("'gone.cerial' names a file the corpus does not have");
  });

  test('an unknown id fails', () => {
    const problems = unknownExclusions(FILES, { 'a.cerial': 'no-such-row' });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("'no-such-row'");
  });

  test('an absent file with an unknown id reports both', () => {
    expect(unknownExclusions(FILES, { 'gone.cerial': 'no-such-row' })).toHaveLength(2);
  });

  test('an exclusion whose schema round-trips fails', async () => {
    const stale = await staleExclusions({ 'a.cerial': ID, 'c.cerial': ID }, (file) => file === 'a.cerial');
    expect(stale).toHaveLength(1);
    expect(stale[0]).toContain("'a.cerial'");
  });

  test('an exclusion whose schema still fails to round-trip passes', async () => {
    expect(await staleExclusions({ 'a.cerial': ID }, () => false)).toEqual([]);
  });

  test('convertCorpus rejects a bad map', async () => {
    await expect(convertCorpus({ 'gone.cerial': ID })).rejects.toThrow('does not have');
    await expect(convertCorpus({ [loadCorpus().files[0]!]: 'no-such-row' })).rejects.toThrow('LOSSY_CASES');
  });

  test('convertCorpus rejects a stale exclusion', async () => {
    await expect(convertCorpus({ [loadCorpus().files[0]!]: ID }, () => true)).rejects.toThrow('round-trips now');
  });

  test('convertCorpus accepts a genuine exclusion and drops the file', async () => {
    const first = loadCorpus().files[0]!;
    const subset = await convertCorpus({ [first]: ID }, () => false);
    expect(subset.files).not.toContain(first);
    expect(subset.excluded).toEqual({ [first]: ID });
  });

  test('convertCorpus fails when every file is excluded', async () => {
    const all = Object.fromEntries(loadCorpus().files.map((f) => [f, ID]));
    await expect(convertCorpus(all, () => false)).rejects.toThrow('every corpus file is excluded');
  });
});
