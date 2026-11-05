/**
 * Hostile-schema harness: write a schema into a temp project, run `cerial generate` as a subprocess, and
 * import whatever it generated in a second subprocess, so code that runs on import is observed, never run
 * inside the test process. Needs no database.
 */

import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ORM_ROOT = resolve(import.meta.dir, '../../..');
const CLI = join(ORM_ROOT, 'bin/cerial.ts');
const ORM_ENTRY = join(ORM_ROOT, 'src/index.ts');

const cleanups: Array<() => Promise<void>> = [];

export async function cleanupFixtures(): Promise<void> {
  await Promise.all(cleanups.splice(0).map((fn) => fn()));
}

export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface GeneratedFixture extends ProcessResult {
  /** Every file under the output directory, relative to it; empty when nothing was written */
  output: string[];
  /** Import the generated client in a fresh process */
  importClient: () => Promise<ProcessResult>;
}

async function run(cmd: string[], cwd: string): Promise<ProcessResult> {
  const proc = Bun.spawn(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);

  return { exitCode: await proc.exited, stdout, stderr };
}

async function listTree(dir: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map(async (e) =>
      e.isDirectory() ? listTree(join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`],
    ),
  );

  return nested.flat();
}

/** Generate a client from `files` (name to `.cerial` source) inside a throwaway project */
export async function generateFixture(files: Record<string, string>): Promise<GeneratedFixture> {
  const base = await mkdtemp(join(tmpdir(), 'cerial-hostile-'));
  cleanups.push(() => rm(base, { recursive: true, force: true }));

  const schemaDir = join(base, 'schemas');
  await mkdir(schemaDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) await writeFile(join(schemaDir, name), content, 'utf8');

  // The generated client imports 'cerial'; point it at this checkout's source
  const shim = join(base, 'node_modules/cerial');
  await mkdir(shim, { recursive: true });
  await writeFile(join(shim, 'index.ts'), `export * from ${JSON.stringify(ORM_ENTRY)};\n`);
  await writeFile(join(shim, 'schema.ts'), `export * from ${JSON.stringify(join(ORM_ROOT, 'src/schema/index.ts'))};\n`);
  await writeFile(join(shim, 'package.json'), '{"name":"cerial","type":"module","main":"index.ts"}');

  const result = await run(['bun', 'run', CLI, 'generate', '-s', 'schemas', '-o', 'out'], base);
  const entry = join(base, 'importer.ts');
  await writeFile(entry, "await import('./out/index.ts');\n");

  return {
    ...result,
    output: await listTree(join(base, 'out')),
    importClient: () => run(['bun', 'run', entry], base),
  };
}
