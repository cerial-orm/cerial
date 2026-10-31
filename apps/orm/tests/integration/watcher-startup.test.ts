/**
 * The watcher's ready line against real file events. Needs no database.
 *
 * On macOS a watch goes live some time after `watch()` returns, and the gap is widest while the system's
 * file event service is busy, so the first test floods it from separate processes.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { chmod, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { startWatcherWithCallback } from '../../src/cli/watcher';

const ROOT = resolve(import.meta.dir, '../.tmp-watcher-startup');
const CHURN = (dir: string) => `
const { mkdirSync, unlinkSync, writeFileSync } = require('node:fs');
mkdirSync(${JSON.stringify(dir)}, { recursive: true });
for (;;) {
  for (let i = 0; i < 500; i++) writeFileSync(${JSON.stringify(dir)} + '/f' + i, 'x');
  for (let i = 0; i < 500; i++) unlinkSync(${JSON.stringify(dir)} + '/f' + i);
}
`;

let counter = 0;

async function makeSchema(): Promise<string> {
  const schemaPath = join(ROOT, `p${counter++}`);
  await mkdir(schemaPath, { recursive: true });
  await writeFile(join(schemaPath, 'user.cerial'), 'model User {}\n');

  return schemaPath;
}

function within(ms: number, event: Promise<unknown>): Promise<boolean> {
  return Promise.race([event.then(() => true), new Promise<boolean>((done) => setTimeout(() => done(false), ms))]);
}

describe('the ready line of a watcher', () => {
  let logSpy: ReturnType<typeof spyOn>;
  let ready: () => void;
  let announced: Promise<void>;

  beforeEach(async () => {
    await mkdir(ROOT, { recursive: true });
    announced = new Promise((done) => (ready = done));
    logSpy = spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      if (String(args[0]).includes('Watching')) ready();
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  afterAll(async () => {
    await rm(ROOT, { recursive: true, force: true });
  });

  it('a change made straight after it is seen, with the file event service busy', async () => {
    const churn = [0, 1, 2, 3].map((n) =>
      Bun.spawn([process.execPath, '-e', CHURN(join(ROOT, `churn${n}`))], { stdout: 'ignore', stderr: 'ignore' }),
    );
    try {
      await new Promise((done) => setTimeout(done, 1_000));
      for (let round = 0; round < 8; round++) {
        announced = new Promise((done) => (ready = done));
        const schemaPath = await makeSchema();
        let changed: () => void = () => {};
        const seen = new Promise<void>((done) => (changed = done));
        const stopped = startWatcherWithCallback([{ schemaPath }], async () => changed());
        await announced;

        await writeFile(join(schemaPath, 'user.cerial'), 'model User {}\n// edited\n');
        const delivered = await within(5_000, seen);
        process.emit('SIGINT');
        await stopped;

        expect(delivered).toBe(true);
      }
    } finally {
      for (const child of churn) child.kill();
      await Promise.all(churn.map((child) => child.exited));
    }
  }, 60_000);

  it('proving the watch live reaches no callback and leaves nothing behind', async () => {
    const schemaPath = await makeSchema();
    const changes: string[] = [];
    const stopped = startWatcherWithCallback(
      [{ schemaPath }],
      async (_target, filename) => void changes.push(filename),
    );
    await announced;
    await new Promise((done) => setTimeout(done, 600));
    process.emit('SIGINT');
    await stopped;

    // macOS may replay the fixture's own write from just before the watch started
    expect(changes.filter((name) => name !== 'user.cerial')).toEqual([]);
    expect(await readdir(schemaPath)).toEqual(['user.cerial']);
  });

  it('a directory it cannot write to is still watched', async () => {
    const schemaPath = await makeSchema();
    await chmod(schemaPath, 0o555);
    try {
      const stopped = startWatcherWithCallback([{ schemaPath }], async () => {});

      expect(await within(2_000, announced)).toBe(true);
      process.emit('SIGINT');
      await stopped;
    } finally {
      await chmod(schemaPath, 0o755);
    }
  });

  it('stopping before the watch is proven says nothing and ends', async () => {
    const schemaPath = await makeSchema();
    const stopped = startWatcherWithCallback([{ schemaPath }], async () => {});
    process.emit('SIGINT');
    await stopped;
    await new Promise((done) => setTimeout(done, 100));

    expect(await within(0, announced)).toBe(false);
  });
});
