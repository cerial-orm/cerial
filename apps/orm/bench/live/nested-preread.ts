import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { BoundQuery, Surreal } from 'surrealdb';
import { assertDistFresh, median } from '../curve';

const PACKAGE_ROOT = join(import.meta.dir, '..', '..');
export const URL = 'http://127.0.0.1:8000';
export const NAMESPACE = 'main';
export const DEFAULT_ITERATIONS = 100;
export const WARMUP = 5;
export const ID_COUNTS: readonly number[] = [1, 10, 100];

/** Many-to-many, so one `connect` can name any number of target records */
export const SCHEMA = `model BenchPost {
  id Record @id
  title String
  tagIds Record[]
  tags Relation[] @field(tagIds) @model(BenchTag)
}

model BenchTag {
  id Record @id
  name String
  postIds Record[]
  posts Relation[] @field(postIds) @model(BenchPost)
}
`;

/** Reads `--iterations n`; refuses anything else */
export function parseLiveArgs(argv: readonly string[]): { iterations: number } {
  let iterations = DEFAULT_ITERATIONS;

  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] !== '--iterations') throw new Error(`unknown argument "${argv[i]}"`);

    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error('--iterations needs a value');

    iterations = Number(value);
    if (!Number.isInteger(iterations) || iterations < 1) {
      throw new Error(`--iterations takes an integer of at least 1, got "${value}"`);
    }
  }

  return { iterations };
}

/** Nearest-rank percentile of `values`, `p` in (0, 100] */
export function percentile(values: readonly number[], p: number): number {
  if (!values.length) throw new Error('percentile of no values');
  if (!(p > 0 && p <= 100)) throw new Error(`percentile takes a value in (0, 100], got ${p}`);

  const sorted = [...values].sort((a, b) => a - b);

  return sorted[Math.ceil((p / 100) * sorted.length) - 1]!;
}

/** A separate existence check selects the named ids first; the folded write has none, so none should be seen */
export function isPreRead(text: string): boolean {
  return text.trimStart().startsWith('SELECT id FROM $ids');
}

export interface LiveRow {
  readonly ids: number;
  readonly iterations: number;
  readonly withMedianMs: number;
  readonly withP95Ms: number;
  /** `query` calls one folded write makes */
  readonly foldedCalls: number;
  /** `query` calls the bare write makes */
  readonly bareCalls: number;
  readonly aloneMedianMs: number;
  readonly aloneP95Ms: number;
  readonly addedMedianMs: number;
  readonly addedP95Ms: number;
}

export function summarise(
  ids: number,
  withSamples: readonly number[],
  aloneSamples: readonly number[],
  foldedCalls = 1,
  bareCalls = 1,
): LiveRow {
  const withMedianMs = median(withSamples);
  const withP95Ms = percentile(withSamples, 95);
  const aloneMedianMs = median(aloneSamples);
  const aloneP95Ms = percentile(aloneSamples, 95);

  return {
    ids,
    iterations: withSamples.length,
    withMedianMs,
    withP95Ms,
    foldedCalls,
    bareCalls,
    aloneMedianMs,
    aloneP95Ms,
    addedMedianMs: withMedianMs - aloneMedianMs,
    addedP95Ms: withP95Ms - aloneP95Ms,
  };
}

export function formatLive(rows: readonly LiveRow[]): string {
  const header = [
    'ids',
    'iters',
    'folded med',
    'folded p95',
    'bare med',
    'bare p95',
    '+med',
    '+p95',
    'calls folded',
    'calls bare',
  ];
  const ms = (value: number): string => value.toFixed(2);
  const lines = rows.map((r) => [
    String(r.ids),
    String(r.iterations),
    ms(r.withMedianMs),
    ms(r.withP95Ms),
    ms(r.aloneMedianMs),
    ms(r.aloneP95Ms),
    ms(r.addedMedianMs),
    ms(r.addedP95Ms),
    String(r.foldedCalls),
    String(r.bareCalls),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i]!.length)));
  const render = (cells: string[]): string => cells.map((c, i) => c.padStart(widths[i]!)).join('  ');

  return [
    'nested connect write, ms (folded write as the client runs it, against the same statement sent through query())',
    render(header),
    ...lines.map(render),
  ].join('\n');
}

function linkDependencies(caseDir: string): void {
  const modules = join(caseDir, 'node_modules');
  mkdirSync(modules, { recursive: true });
  symlinkSync(PACKAGE_ROOT, join(modules, 'cerial'));

  for (const name of ['surrealdb', 'ts-toolbelt']) {
    const manifest = Bun.fileURLToPath(import.meta.resolve(`${name}/package.json`));
    symlinkSync(dirname(manifest), join(modules, name));
  }
}

async function generateClient(caseDir: string): Promise<string> {
  const schemaDir = join(caseDir, 'schema');
  const genDir = join(caseDir, 'gen');
  mkdirSync(schemaDir, { recursive: true });
  writeFileSync(join(schemaDir, 'schema.cerial'), SCHEMA);

  const proc = Bun.spawn(
    ['node', join(PACKAGE_ROOT, 'dist', 'bin', 'cerial.mjs'), 'generate', '-s', schemaDir, '-o', genDir, '-y'],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  if (exitCode !== 0) throw new Error(`cerial generate failed (exit ${exitCode}): ${(stderr || stdout).slice(0, 500)}`);

  return join(genDir, 'index.ts');
}

interface BenchClient {
  connect(config: object): Promise<unknown>;
  migrate(): Promise<unknown>;
  disconnect(): Promise<unknown>;
  getTransactionSurreal(): Surreal | undefined;
  query(text: string, vars?: Record<string, unknown>): Promise<unknown>;
  db: {
    BenchTag: { create(args: { data: { name: string } }): Promise<{ id: { toString(): string } }> };
    BenchPost: { create(args: { data: { title: string; tags: { connect: string[] } } }): Promise<unknown> };
  };
}

async function admin(): Promise<Surreal> {
  const surreal = new Surreal();
  try {
    await surreal.connect(`${URL}/rpc`);
  } catch (error) {
    throw new Error(
      `cannot reach SurrealDB at ${URL} (${error instanceof Error ? error.message : error}); start none, fix the connection`,
    );
  }
  await surreal.signin({ username: 'root', password: 'root' });
  await surreal.use({ namespace: NAMESPACE });

  return surreal;
}

async function timed(run: () => Promise<unknown>): Promise<number> {
  const started = performance.now();
  await run();

  return performance.now() - started;
}

/** Runs the measurement against a database of its own, which is removed again whatever happens */
export async function runLive(iterations: number): Promise<LiveRow[]> {
  assertDistFresh(join(PACKAGE_ROOT, 'dist', 'index.d.mts'), join(PACKAGE_ROOT, 'src'));

  const database = `bench_${process.pid}`;
  const root = mkdtempSync(join(tmpdir(), 'cerial-live-'));
  const surrealAdmin = await admin();
  let created = false;
  let client: BenchClient | undefined;

  const cleanup = async (): Promise<void> => {
    try {
      await client?.disconnect();
    } catch {
      // the connection may already be gone; removal below is what matters
    }
    try {
      if (created) await surrealAdmin.query(`REMOVE DATABASE IF EXISTS ${database};`);
    } finally {
      await surrealAdmin.close();
      rmSync(root, { recursive: true, force: true });
    }
  };
  const onSignal = (): void => {
    void cleanup().finally(() => process.exit(130));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    linkDependencies(root);
    const entry = await generateClient(root);
    const { CerialClient } = (await import(entry)) as { CerialClient: new () => BenchClient };

    await surrealAdmin.query(`DEFINE DATABASE ${database};`);
    created = true;

    client = new CerialClient();
    await client.connect({ url: URL, namespace: NAMESPACE, database, auth: { username: 'root', password: 'root' } });
    await client.migrate();
    const surreal = client.getTransactionSurreal();
    if (!surreal) throw new Error('client has no connection');

    const tagIds: string[] = [];
    for (let i = 0; i < Math.max(...ID_COUNTS); i++) {
      tagIds.push((await client.db.BenchTag.create({ data: { name: `tag-${i}` } })).id.toString());
    }

    // The bare write is the statement the folded write sends, captured as it goes by
    const original = surreal.query.bind(surreal) as (...args: unknown[]) => unknown;
    let captured: BoundQuery | undefined;
    let calls = 0;
    let preReads = 0;
    (surreal as unknown as { query: (...args: unknown[]) => unknown }).query = (...args) => {
      const [first] = args;
      calls++;
      if (first instanceof BoundQuery) {
        if (isPreRead(first.query)) preReads++;
        else captured = first;
      }

      return original(...args);
    };

    const rows: LiveRow[] = [];
    for (const count of ID_COUNTS) {
      const connect = tagIds.slice(0, count);
      const folded = (): Promise<unknown> =>
        client!.db.BenchPost.create({ data: { title: 'post', tags: { connect } } });

      captured = undefined;
      calls = 0;
      await folded();
      if (!captured) throw new Error('the nested write was not seen');
      if (preReads) throw new Error('a separate target pre-read was sent; the check is not folded');
      const write = captured as BoundQuery;
      const foldedCalls = calls;
      const bare = (): Promise<unknown> => client!.query(write.query, write.bindings);

      calls = 0;
      await bare();
      const bareCalls = calls;

      for (let i = 0; i < WARMUP; i++) {
        await folded();
        await bare();
      }

      // Alternating the two keeps drift in the database from favouring either
      const withSamples: number[] = [];
      const aloneSamples: number[] = [];
      for (let i = 0; i < iterations; i++) {
        withSamples.push(await timed(folded));
        aloneSamples.push(await timed(bare));
      }

      rows.push(summarise(count, withSamples, aloneSamples, foldedCalls, bareCalls));
    }

    return rows;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    await cleanup();
  }
}

if (import.meta.main) {
  try {
    const { iterations } = parseLiveArgs(process.argv.slice(2));
    console.log(formatLive(await runLive(iterations)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
