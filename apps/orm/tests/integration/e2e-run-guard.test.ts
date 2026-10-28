/**
 * The e2e run guard's failure modes, driven directly with temp directories.
 *
 * Needs no database and does not import the generated client.
 */

import { afterEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveRunDir, resolveTestDatabase, runOnce } from '../e2e/run-guard';

const FAST = { timeoutMs: 300, pollMs: 5 };
const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cerial-run-guard-test-'));
  dirs.push(dir);

  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('runOnce concurrency', () => {
  it('runs the work once and tells the waiter the marker was observed', async () => {
    const runDir = tempDir();
    let calls = 0;
    const work = async (): Promise<void> => {
      calls++;
      await sleep(40);
    };

    const results = await Promise.all([runOnce('gen', work, runDir, FAST), runOnce('gen', work, runDir, FAST)]);

    expect(calls).toBe(1);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((r) => !r)).toHaveLength(1);
    expect(existsSync(join(runDir, 'gen.done'))).toBe(true);
  });

  it('runs the work once across two real processes', async () => {
    const runDir = tempDir();
    const script = join(tempDir(), 'child.ts');
    const guardPath = join(import.meta.dir, '..', 'e2e', 'run-guard.ts');
    writeFileSync(
      script,
      `import { runOnce } from ${JSON.stringify(guardPath)};
const ran = await runOnce('gen', async () => { await new Promise((r) => setTimeout(r, 150)); }, process.argv[2]!, { timeoutMs: 5000, pollMs: 5 });
console.log(ran ? 'ran' : 'waited');
`,
    );

    const spawn = (): Bun.Subprocess<'ignore', 'pipe', 'inherit'> =>
      Bun.spawn(['bun', script, runDir], { stdout: 'pipe', stderr: 'inherit' });
    const procs = [spawn(), spawn()];
    const outputs = await Promise.all(procs.map((p) => new Response(p.stdout).text()));
    await Promise.all(procs.map((p) => p.exited));

    expect(procs.map((p) => p.exitCode)).toEqual([0, 0]);
    expect(outputs.map((o) => o.trim()).sort()).toEqual(['ran', 'waited']);
  });
});

describe('runOnce failure modes', () => {
  it('throws with the marker path when a lock is held and no marker ever appears', async () => {
    const runDir = tempDir();
    mkdirSync(join(runDir, 'gen.lock'));
    let ran = false;

    const attempt = runOnce('gen', async () => void (ran = true), runDir, FAST);

    await expect(attempt).rejects.toThrow(join(runDir, 'gen.done'));
    expect(ran).toBe(false);
  });

  it('throws at once, well before the timeout, when the winner failed', async () => {
    const runDir = tempDir();
    const options = { timeoutMs: 5000, pollMs: 5 };
    const started = Date.now();

    const winner = runOnce(
      'gen',
      async () => {
        await sleep(30);
        throw new Error('boom');
      },
      runDir,
      options,
    );
    const waiter = runOnce('gen', async () => {}, runDir, options);

    await expect(winner).rejects.toThrow('boom');
    await expect(waiter).rejects.toThrow('boom');
    expect(Date.now() - started).toBeLessThan(2000);
    expect(existsSync(join(runDir, 'gen.failed'))).toBe(true);
  });
});

describe('run key isolation', () => {
  it('ignores a done marker left in the run directory of another key', async () => {
    const original = process.env.CERIAL_E2E_RUN_ID;
    const suffix = `${process.pid}-${Date.now()}`;
    let otherDir: string;
    let ownDir: string;

    try {
      process.env.CERIAL_E2E_RUN_ID = `other-${suffix}`;
      otherDir = resolveRunDir('/schemas');
      process.env.CERIAL_E2E_RUN_ID = `own-${suffix}`;
      ownDir = resolveRunDir('/schemas');
    } finally {
      if (original === undefined) delete process.env.CERIAL_E2E_RUN_ID;
      else process.env.CERIAL_E2E_RUN_ID = original;
    }
    dirs.push(otherDir, ownDir);

    expect(otherDir).not.toBe(ownDir);
    mkdirSync(otherDir, { recursive: true });
    writeFileSync(join(otherDir, 'gen.done'), 'stale\n');
    let calls = 0;

    const ran = await runOnce('gen', async () => void calls++, ownDir, FAST);

    expect(ran).toBe(true);
    expect(calls).toBe(1);
  });

  it('derives different run directories for different schema directories', () => {
    const original = process.env.CERIAL_E2E_RUN_ID;
    delete process.env.CERIAL_E2E_RUN_ID;

    try {
      expect(resolveRunDir('/schemas/a')).not.toBe(resolveRunDir('/schemas/b'));
      expect(resolveRunDir('/schemas/a')).toBe(resolveRunDir('/schemas/a'));
    } finally {
      if (original !== undefined) process.env.CERIAL_E2E_RUN_ID = original;
    }
  });
});

describe('resolveTestDatabase', () => {
  it('uses main outside a parallel worker', () => {
    expect(resolveTestDatabase({})).toBe('main');
  });

  it('suffixes the worker id inside a parallel worker', () => {
    expect(resolveTestDatabase({ BUN_TEST_WORKER_ID: '3' })).toBe('main_w3');
  });

  it('lets CERIAL_E2E_DB win over the worker id and the default', () => {
    expect(resolveTestDatabase({ CERIAL_E2E_DB: 'custom' })).toBe('custom');
    expect(resolveTestDatabase({ CERIAL_E2E_DB: 'custom', BUN_TEST_WORKER_ID: '3' })).toBe('custom');
  });
});
