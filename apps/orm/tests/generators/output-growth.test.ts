/**
 * Generated output must not grow past a bound as the schema grows. The same synthetic schema is generated at two
 * sizes: entity files stay flat, chunk files stay under a cap, and each aggregator stays under a bytes-per-model cap.
 * The check is a pure function over file sizes, so it is also run against deliberately broken size maps.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { generateSingleSchema } from '../../src/cli/generate';
import type { TypeFilesMode } from '../../src/cli/config/types';
import { syntheticSchema } from '../../bench/schema';

const SMALL = 50;
const LARGE = 200;
const FIELDS_PER_MODEL = 6;

/** An entity file embeds its neighbours' names, so a longer name digit run adds a few bytes (measured: 13 to 35) */
const NAME_DIGIT_ALLOWANCE = 64;

/** A model new at the larger size draws its own scalar types, so it is held to the smaller size's largest file plus this share */
const NEW_ENTITY_SPREAD = 1.1;

/**
 * Per-chunk byte caps, 1.5 times the measured full chunk (50 entries). Measured full chunks:
 * models 235,725 B, migrations 59,407 B, objects about 44,000 B (881 B per entry), tuples about 17,500 B (350 B per entry).
 * Literals share the objects cap, since a literal entry is no larger than an object entry.
 */
const CHUNK_CAPS: ReadonlyArray<{ readonly pattern: RegExp; readonly cap: number }> = [
  { pattern: /^internal\/registry\/models\/chunk-\d+\.ts$/, cap: 354_000 },
  { pattern: /^internal\/registry\/objects\/chunk-\d+\.ts$/, cap: 66_000 },
  { pattern: /^internal\/registry\/tuples\/chunk-\d+\.ts$/, cap: 26_000 },
  { pattern: /^internal\/registry\/literals\/chunk-\d+\.ts$/, cap: 66_000 },
  { pattern: /^internal\/migrations\/chunk-\d+\.ts$/, cap: 90_000 },
];

/**
 * Per-aggregator caps in bytes per model, each 1.5 times the measured slope between 50 and 200 models.
 * Measured slopes, bytes per model: client 166, index 443, models barrel 38, objects barrel 8, migrations 124
 * (fingerprints per model), manifest 819, model-registry 2, internal/index 0, tuples barrel 0 (one tuple at both sizes).
 * The two flat ones carry a small cap so a new per-model line still fails.
 */
const AGGREGATOR_CAPS: Readonly<Record<string, number>> = {
  'client.ts': 250,
  'index.ts': 665,
  'models/index': 57,
  'objects/index': 12,
  'tuples/index': 8,
  'internal/index': 8,
  'internal/model-registry.ts': 3,
  'internal/migrations.ts': 186,
  'internal/manifest.ts': 1_230,
};

/** `models/index.d.ts` and `models/index.ts` are the same aggregator under the two layouts */
const aggregatorKey = (path: string): string => path.replace(/\.d\.ts$/, '').replace(/^(.+\/index)\.ts$/, '$1');

/** One file per model, object, tuple, literal or enum: these must not grow with the schema */
const ENTITY_FILE = /^(models|objects|tuples|literals|enums)\/(?!index\.)[^/]+\.(d\.)?ts$/;

type Sizes = Record<string, number>;

const isChunk = (path: string): boolean => CHUNK_CAPS.some(({ pattern }) => pattern.test(path));
const isAggregator = (path: string): boolean => aggregatorKey(path) in AGGREGATOR_CAPS;

const familyOf = (path: string): string => path.slice(0, path.indexOf('/'));

/** Every violation, each naming the file it is about */
function checkGrowth(small: Sizes, large: Sizes): string[] {
  const problems: string[] = [];

  for (const [path, size] of Object.entries(large)) {
    if (isChunk(path)) continue;
    if (isAggregator(path)) continue;
    if (!ENTITY_FILE.test(path)) problems.push(`${path}: not a chunk, an aggregator or an entity file`);
    else if (!(path in small) && size > maxOfFamily(small, familyOf(path)) * NEW_ENTITY_SPREAD)
      problems.push(`${path}: ${size} B grows past the ${SMALL}-model entity files`);
  }

  for (const [path, size] of Object.entries(small)) {
    if (isChunk(path) || isAggregator(path)) continue;
    if (!ENTITY_FILE.test(path)) problems.push(`${path}: not a chunk, an aggregator or an entity file`);
    else if (path in large && Math.abs(large[path]! - size) > NAME_DIGIT_ALLOWANCE)
      problems.push(`${path}: ${size} B then ${large[path]} B, an entity file grew with the schema`);
  }

  for (const sizes of [small, large]) {
    for (const [path, size] of Object.entries(sizes)) {
      const chunk = CHUNK_CAPS.find(({ pattern }) => pattern.test(path));
      if (chunk && size > chunk.cap) problems.push(`${path}: ${size} B is over the ${chunk.cap} B chunk cap`);
    }
  }

  for (const path of Object.keys(large)) {
    const cap = AGGREGATOR_CAPS[aggregatorKey(path)];
    if (cap === undefined) continue;
    const slope = (large[path]! - (small[path] ?? 0)) / (LARGE - SMALL);
    if (slope > cap) problems.push(`${path}: grows ${slope.toFixed(0)} B per model, over the ${cap} B cap`);
  }

  return problems;
}

const maxOfFamily = (sizes: Sizes, family: string): number =>
  Math.max(
    0,
    ...Object.entries(sizes)
      .filter(([p]) => ENTITY_FILE.test(p) && familyOf(p) === family)
      .map(([, s]) => s),
  );

const scratch = mkdtempSync(join(tmpdir(), 'cerial-output-growth-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const walk = (dir: string, root: string = dir, out: Sizes = {}): Sizes => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, root, out);
    else out[relative(root, path).split('\\').join('/')] = statSync(path).size;
  }

  return out;
};

async function generateSizes(models: number, typeFiles: TypeFilesMode): Promise<Sizes> {
  const root = mkdtempSync(join(scratch, `${typeFiles}-${models}-`));
  const schemaDir = join(root, 'schema');
  mkdirSync(schemaDir);
  writeFileSync(
    join(schemaDir, 'bench.cerial'),
    syntheticSchema({ models, fieldsPerModel: FIELDS_PER_MODEL, seed: 1 }),
  );
  const result = await generateSingleSchema({
    schemaPath: schemaDir,
    outputDir: join(root, 'generated'),
    typeFiles,
    logLevel: 'minimal',
  });
  if (!result.success) throw new Error(`generate failed: ${result.errors.join('; ')}`);

  return walk(join(root, 'generated'));
}

describe.each(['dts', 'ts'] as const)('output growth with typeFiles %s', (typeFiles) => {
  let small: Sizes;
  let large: Sizes;

  test('generates both sizes', async () => {
    small = await generateSizes(SMALL, typeFiles);
    large = await generateSizes(LARGE, typeFiles);

    expect(Object.keys(large).length).toBeGreaterThan(Object.keys(small).length);
  });

  test('no generated file grows past its bound', () => {
    expect(checkGrowth(small, large)).toEqual([]);
  });

  test('the registry body back in model-registry.ts is reported by file name', () => {
    const chunkBytes = Object.entries(large)
      .filter(([p]) => p.startsWith('internal/registry/'))
      .reduce((sum, [, size]) => sum + size, 0);
    const inlineSmall = Object.entries(small)
      .filter(([p]) => p.startsWith('internal/registry/'))
      .reduce((sum, [, size]) => sum + size, 0);
    const problems = checkGrowth(
      { ...small, 'internal/model-registry.ts': small['internal/model-registry.ts']! + inlineSmall },
      { ...large, 'internal/model-registry.ts': large['internal/model-registry.ts']! + chunkBytes },
    );

    expect(problems.some((p) => p.startsWith('internal/model-registry.ts:'))).toBe(true);
  });

  test('an entity file that grows with the schema is reported by file name', () => {
    const [name] = Object.keys(small).filter((p) => ENTITY_FILE.test(p) && p.startsWith('models/'));
    const problems = checkGrowth(small, { ...large, [name!]: small[name!]! + 5_000 });

    expect(problems.some((p) => p.startsWith(`${name}:`))).toBe(true);
  });

  test('an oversized chunk is reported by file name', () => {
    const problems = checkGrowth(small, { ...large, 'internal/migrations/chunk-0.ts': 90_001 });

    expect(problems.some((p) => p.startsWith('internal/migrations/chunk-0.ts:'))).toBe(true);
  });

  test('a generated file on neither list is reported by file name', () => {
    const problems = checkGrowth(small, { ...large, 'internal/lookup.ts': 100 });

    expect(problems).toEqual(['internal/lookup.ts: not a chunk, an aggregator or an entity file']);
  });
});
