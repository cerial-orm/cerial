import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { consumerSource, syntheticConsumerSpec } from '../../../bench/consumer';
import { measureCase } from '../../../bench/curve';
import { CompletionProbe, type ServerKind } from '../../../bench/editor';
import { syntheticSchema } from '../../../bench/schema';

const DIST = join(import.meta.dir, '..', '..', '..', 'dist', 'index.d.mts');
const withDist = existsSync(DIST) ? describe : describe.skip;

const FIELDS = 4;
const MODEL_KEYS = ['id', ...Array.from({ length: FIELDS }, (_, i) => `field${i}`), 'profile', 'spot', 'nextId'];
const OBJECT_KEYS = ['label', 'rank', 'detail'];

/** Every probe is a consumer whose last statement is a query with the cursor at `|` */
const model = (select: string): string => `import type { CerialClient } from './gen';
declare const client: CerialClient;
export const probe = client.db.BenchModel0.findMany({ select: ${select} });
`;
const embedded = (select: string): string => model(`{ profile: ${select} }`);

/** A `select` body with the first `taken` keys set, then the cursor */
function body(keys: readonly string[], taken: number): string {
  const set = keys.slice(0, taken).map((key) => `${key}: true, `);

  return `{ ${set.join('')}| }`;
}

withDist('select key completion', () => {
  let root = '';
  let caseDir = '';

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'cerial-select-completion-'));
    const schemaDir = join(root, 'schema');
    mkdirSync(schemaDir);
    const schema = syntheticSchema({ models: 10, fieldsPerModel: FIELDS, seed: 1 });
    writeFileSync(join(schemaDir, 'bench.cerial'), schema);
    const bench = {
      sizes: [],
      runs: 1,
      compilers: ['5.9' as const],
      fields: FIELDS,
      json: null,
      ceiling: null,
      heapMb: 4096,
      case: null,
    };
    await measureCase(
      root,
      { name: 'select completion', size: 10, schemaDir, consumer: consumerSource(syntheticConsumerSpec(schema)) },
      bench,
      0,
    );
    caseDir = join(root, 'case-0');
  }, 180_000);

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const servers: readonly [ServerKind, string][] = [
    ['tsserver', '5.9.3 tsserver'],
    ['lsp', '7.0.2 LSP'],
  ];

  for (const [kind, name] of servers) {
    describe(name, () => {
      let probe: CompletionProbe;
      beforeAll(() => {
        probe = new CompletionProbe(caseDir, kind, 90_000);
      });
      afterAll(() => probe.close());

      const cases: readonly [string, readonly string[], (select: string) => string][] = [
        ['a model', MODEL_KEYS, model],
        ['an embedded object', OBJECT_KEYS, embedded],
      ];

      for (const [label, keys, wrap] of cases) {
        // after none, one, two and all-but-one keys: exactly the rest, and no global names
        for (const taken of new Set([0, 1, 2, keys.length - 1])) {
          test(`offers exactly the remaining keys of ${label} after ${taken} taken`, async () => {
            // LSP marks optional members with a trailing ?. `valueOf` comes from the boolean half of the `boolean | Select` slot
            // an embedded object sits in, not from the select type
            const labels = (await probe.labels(wrap(body(keys, taken))))
              .map((entry) => entry.replace(/\?$/, ''))
              .filter((entry) => entry !== 'valueOf');
            const offered = keys.filter((key) => labels.includes(key));

            expect(offered).toEqual(keys.slice(taken));
            expect(labels.length).toBe(keys.length - taken);
          }, 120_000);
        }
      }
    });
  }
});
