/**
 * Once-per-run guard for the e2e preload.
 *
 * Under `--parallel` Bun spawns one process per worker and re-evaluates the preload once per test
 * file, so only the filesystem outlives an evaluation. A step is keyed by name inside a run
 * directory: the process that creates the lock directory does the work and writes the done marker,
 * every other process polls for that marker.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface GuardOptions {
  /** Directory holding the lock and marker files. Defaults to the per-run directory. */
  readonly runDir?: string;
  readonly timeoutMs?: number;
  readonly pollMs?: number;
}

const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_POLL_MS = 50;

/**
 * The per-run directory. process.ppid is the orchestrator shared by every worker, and it changes
 * between runs, so a marker from a finished run is never mistaken for the current one.
 */
export function resolveRunDir(schemaDir: string): string {
  const override = process.env.CERIAL_E2E_RUN_ID;
  const key = override || `${process.ppid}-${createHash('sha1').update(schemaDir).digest('hex').slice(0, 8)}`;

  return join(tmpdir(), `cerial-e2e-${key}`);
}

/** True when Bun is running this process as a `--parallel` worker. */
export function isParallelWorker(): boolean {
  return Boolean(process.env.BUN_TEST_WORKER_ID);
}

/**
 * Runs `work` in exactly one process per run directory and step name; the others wait for it.
 * Returns true for the process that did the work. A waiter that times out throws, because falling
 * through would run tests against a step that never finished.
 */
export async function runOnce(
  step: string,
  work: () => Promise<void>,
  runDir: string,
  options: Omit<GuardOptions, 'runDir'> = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const lockDir = join(runDir, `${step}.lock`);
  const doneFile = join(runDir, `${step}.done`);
  const failedFile = join(runDir, `${step}.failed`);

  mkdirSync(runDir, { recursive: true });

  try {
    mkdirSync(lockDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;

    return await waitForMarker(doneFile, failedFile, timeoutMs, pollMs);
  }

  try {
    await work();
  } catch (error) {
    writeFileSync(failedFile, `${process.pid} ${new Date().toISOString()} ${String(error)}\n`);
    throw error;
  }

  // Write then rename so a poller never reads a half-written marker.
  const pending = `${doneFile}.${process.pid}`;
  writeFileSync(pending, `${process.pid} ${new Date().toISOString()}\n`);
  renameSync(pending, doneFile);

  return true;
}

async function waitForMarker(
  doneFile: string,
  failedFile: string,
  timeoutMs: number,
  pollMs: number,
): Promise<boolean> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (existsSync(doneFile)) return false;
    if (existsSync(failedFile)) {
      throw new Error(
        `E2E setup failed in another process: ${readFileSync(failedFile, 'utf8').trim()} (${failedFile})`,
      );
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  throw new Error(`Timed out after ${Date.now() - started}ms waiting for e2e setup marker ${doneFile}`);
}
