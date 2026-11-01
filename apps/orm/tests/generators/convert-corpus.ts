/**
 * The part of the e2e corpus the round-trip proofs run over: every schema file, less the ones named in
 * `CORPUS_EXCLUSIONS`. Files are enumerated, so a schema added to the corpus joins with no edit here.
 */
import { LOSSY_CASES } from '../../src/cli/convert/lossy-cases';
import {
  cleanScratch,
  compareFile,
  compareRoundTrip,
  corpusSources,
  emitSet,
  loadModules,
  writeModules,
} from './convert-helpers';
import { loadCorpus } from './parity-corpus';

/** Corpus schema file (relative to the schemas directory) to the `LOSSY_CASES` id that explains why it cannot round-trip. */
export const CORPUS_EXCLUSIONS: Readonly<Record<string, string>> = {};

export type RoundTrips = (file: string) => boolean | Promise<boolean>;

export interface ConvertCorpus {
  readonly files: readonly string[];
  readonly excluded: Readonly<Record<string, string>>;
}

/** Exclusions that name a file the corpus does not have, or a row `LOSSY_CASES` does not have. */
export function unknownExclusions(
  files: readonly string[],
  exclusions: Readonly<Record<string, string>>,
  knownIds: ReadonlySet<string> = new Set(LOSSY_CASES.map((c) => c.id)),
): string[] {
  const present = new Set(files);
  const problems: string[] = [];
  for (const [file, id] of Object.entries(exclusions)) {
    if (!present.has(file)) problems.push(`exclusion '${file}' names a file the corpus does not have`);
    if (!knownIds.has(id)) problems.push(`exclusion '${file}' cites '${id}', which is not a LOSSY_CASES id`);
  }

  return problems;
}

/** Exclusions whose schema round-trips now; leaving them in would shrink the subset to what is green. */
export async function staleExclusions(
  exclusions: Readonly<Record<string, string>>,
  roundTrips: RoundTrips,
): Promise<string[]> {
  const stale: string[] = [];
  for (const [file, id] of Object.entries(exclusions)) {
    if (await roundTrips(file)) stale.push(`exclusion '${file}' (${id}) round-trips now; remove it`);
  }

  return stale;
}

/** The files the subset keeps: everything not excluded, in corpus order. */
export function subsetOf(files: readonly string[], exclusions: Readonly<Record<string, string>>): string[] {
  return files.filter((file) => !(file in exclusions));
}

/** Both directions for one file: the emitted modules load back to its AST, and printing them gives the same structure. */
async function roundTripsInPlace(file: string): Promise<boolean> {
  try {
    const emitted = emitSet(corpusSources());
    writeModules(emitted.result);
    const built = await loadModules(emitted.result);

    return (
      !emitted.result.refusals.length &&
      !compareFile(emitted, built, file).length &&
      !(await compareRoundTrip(emitted, file)).length
    );
  } catch {
    return false;
  } finally {
    cleanScratch();
  }
}

export async function convertCorpus(
  exclusions: Readonly<Record<string, string>> = CORPUS_EXCLUSIONS,
  roundTrips: RoundTrips = roundTripsInPlace,
): Promise<ConvertCorpus> {
  const { files } = loadCorpus();
  if (!files.length) throw new Error('the e2e corpus holds no schema files');
  const problems = [...unknownExclusions(files, exclusions), ...(await staleExclusions(exclusions, roundTrips))];
  if (problems.length) throw new Error(problems.join('\n'));
  const kept = subsetOf(files, exclusions);
  if (!kept.length) throw new Error('every corpus file is excluded');

  return { files: kept, excluded: exclusions };
}
