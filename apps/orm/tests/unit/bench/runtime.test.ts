import { describe, expect, test } from 'bun:test';
import { existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { CerialUnknownModelError } from '../../../src/errors';
import type { BenchOptions } from '../../../bench/curve';
import { median } from '../../../bench/curve';
import {
  MIN_PROCESSES,
  NODE_COMPILE_FLAGS,
  assertEnoughProcesses,
  guardedSample,
  measureProxy,
  runRuntime,
} from '../../../bench/runtime';

const DIST = join(import.meta.dir, '..', '..', '..', 'dist', 'index.d.mts');
const withDist = existsSync(DIST) ? describe : describe.skip;

const SMALL: BenchOptions = {
  sizes: [3],
  runs: 1,
  compilers: [],
  fields: 3,
  json: null,
  ceiling: null,
  heapMb: 4096,
};

describe('median', () => {
  test('odd count takes the middle value', () => expect(median([9, 1, 5])).toBe(5));
  test('even count averages the two middle values', () => expect(median([4, 1, 3, 2])).toBe(2.5));
  test('one value is its own median', () => expect(median([7])).toBe(7));
  test('no values is refused', () => expect(() => median([])).toThrow('median of no values'));
});

describe('process count', () => {
  test.each([0, 1, MIN_PROCESSES - 1, 2.5, Number.NaN])('%p processes is refused', (processes) => {
    expect(() => assertEnoughProcesses(processes)).toThrow('at least 5 processes');
  });

  test('the minimum is accepted', () => expect(() => assertEnoughProcesses(MIN_PROCESSES)).not.toThrow());

  test('a run below the minimum fails before any work', async () => {
    await expect(runRuntime({ bench: SMALL, processes: 4 }, { allowStale: true })).rejects.toThrow('at least 5');
  });
});

describe('guard bench', () => {
  test('wrapped and unwrapped timings are finite and positive', () => {
    const row = measureProxy(20_000, 3);

    expect(Number.isFinite(row.wrappedNs)).toBe(true);
    expect(Number.isFinite(row.unwrappedNs)).toBe(true);
    expect(row.wrappedNs).toBeGreaterThan(0);
    expect(row.unwrappedNs).toBeGreaterThan(0);
  });

  test('the measured object is the real guard: an unknown model throws, a member passes', () => {
    const client = guardedSample();

    expect(() => client.Uesr).toThrow(CerialUnknownModelError);
    expect(typeof client.connect).toBe('function');
  });
});

withDist('import cost', () => {
  test('both runtimes import a fresh tree and report RSS and the flags used', async () => {
    const { imports } = await runRuntime({ bench: SMALL, processes: MIN_PROCESSES }, { allowStale: true });

    expect(imports.map((row) => row.runtime)).toEqual(['bun', 'node']);
    for (const row of imports) {
      expect(row.rssMb).toBeGreaterThan(0);
      expect(row.importMs).toBeGreaterThan(0);
      expect(row.processes).toBe(MIN_PROCESSES);
    }
    expect(imports[1]!.flags).toContain(NODE_COMPILE_FLAGS.join(' '));
  }, 120_000);

  test('a broken generated tree fails the import row', async () => {
    const tamper = (genDir: string): void =>
      appendFileSync(join(genDir, 'index.ts'), "\nthrow new Error('broken tree');\n");

    await expect(runRuntime({ bench: SMALL, processes: MIN_PROCESSES }, { allowStale: true, tamper })).rejects.toThrow(
      /import failed|compile step failed/,
    );
  }, 120_000);

  test('the node compile skips type checking: a type error still compiles and imports', async () => {
    const tamper = (genDir: string): void =>
      appendFileSync(join(genDir, 'index.ts'), "\nexport const __typeError: number = 'not a number';\n");

    const { imports } = await runRuntime({ bench: SMALL, processes: MIN_PROCESSES }, { allowStale: true, tamper });

    expect(NODE_COMPILE_FLAGS).toContain('--noCheck');
    expect(imports.map((row) => row.runtime)).toEqual(['bun', 'node']);
  }, 120_000);

  test('the node compile still refuses a syntax error', async () => {
    const tamper = (genDir: string): void => appendFileSync(join(genDir, 'index.ts'), '\nexport const = ;\n');

    await expect(runRuntime({ bench: SMALL, processes: MIN_PROCESSES }, { allowStale: true, tamper })).rejects.toThrow(
      /failed/,
    );
  }, 120_000);
});
