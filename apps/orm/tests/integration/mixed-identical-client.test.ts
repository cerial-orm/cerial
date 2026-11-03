/**
 * The same models written wholly in `.cerial`, wholly in TypeScript, and across both (tests/fixtures/mixed), generated
 * by the real CLI. Every written file must be byte-identical, so the authoring form is invisible to a client's user.
 * Needs no database.
 *
 * The three projects use the same file stems in the same directory, because declarations are ordered by file path and
 * then by position in the file; a different stem would reorder the output for a reason no user cares about. The
 * comparison stays byte for byte and is never reduced to a structural one.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { mixedProject, removeMixedProjects } from './mixed-merge-project';

afterAll(removeMixedProjects);

const FIXTURES = join(import.meta.dir, '../fixtures');
const BIN = resolve(import.meta.dir, '../../bin/cerial.ts');

const FORMS: Array<[string, string]> = [
  ['all .cerial', join(FIXTURES, 'mixed-twins/dsl')],
  ['all TypeScript', join(FIXTURES, 'mixed-twins/ts')],
  ['mixed', join(FIXTURES, 'mixed')],
];

async function sources(fixture: string): Promise<Record<string, string>> {
  const names = (await readdir(fixture, { recursive: true })).filter((name) => /\.(cerial|ts)$/.test(name));
  const files = await Promise.all(names.map(async (name) => [name, await readFile(join(fixture, name), 'utf8')]));

  return Object.fromEntries(files);
}

/** Generate a temp copy of `fixture` and return every file the CLI wrote under `client`, keyed by relative path */
async function generateClient(fixture: string, edit?: [string, string, string]): Promise<Record<string, string>> {
  const all = await sources(fixture);
  if (edit) all[edit[0]] = all[edit[0]]!.replace(edit[1], edit[2]);
  const dir = await mixedProject(all);
  const proc = Bun.spawn([process.execPath, 'run', BIN, 'generate', '-y'], {
    cwd: dir,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  expect(await proc.exited, stdout + stderr).toBe(0);

  const out = join(dir, 'client');
  const files: Record<string, string> = {};
  for (const name of (await readdir(out, { recursive: true })).sort()) {
    const text = await readFile(join(out, name), 'utf8').catch(() => null);
    if (text !== null) files[name] = text;
  }

  return files;
}

let clients: Array<Record<string, string>>;

beforeAll(async () => {
  clients = await Promise.all(FORMS.map(([, fixture]) => generateClient(fixture)));
}, 120_000);

describe('the three authoring forms', () => {
  it('generate a substantial client', () => {
    for (const client of clients) expect(Object.keys(client).length).toBeGreaterThan(10);
  });

  it('write the same list of files', () => {
    const [first, ...rest] = clients.map((client) => Object.keys(client));
    for (const [i, names] of rest.entries()) expect(names, FORMS[i + 1]![0]).toEqual(first!);
  });

  it('write byte-identical content in every file, naming the file that differs', () => {
    const [first, ...rest] = clients;
    for (const [i, other] of rest.entries()) {
      const differing = Object.keys(first!).filter((name) => other![name] !== first![name]);

      expect(differing, `${FORMS[i + 1]![0]} differs from ${FORMS[0]![0]} in`).toEqual([]);
    }
  });

  it('is not vacuous: one changed declaration in one form changes the client', async () => {
    const changed = await generateClient(FORMS[0]![1], ['schema/account.cerial', 'title String', 'heading String']);
    const differing = Object.keys(clients[0]!).filter((name) => changed[name] !== clients[0]![name]);

    expect(differing).toContain('models/ticket.d.ts');
  });
});
