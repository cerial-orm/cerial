import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Compiler, compilerBin, parseExtendedDiagnostics, parseTscErrors, runTsc } from '../../../bench/compilers';

const FIXTURE_59 = `Files:                          8
Lines of Library:           44810
Lines of Definitions:           0
Lines of TypeScript:            2
Lines of JavaScript:            0
Lines of JSON:                  0
Lines of Other:                 0
Identifiers:                40034
Symbols:                    26458
Types:                         88
Instantiations:                12
Memory used:               49146K
Assignability cache size:       0
I/O Read time:              0.00s
Parse time:                 0.04s
Program time:               0.05s
Bind time:                  0.02s
Check time:                 0.20s
printTime time:             0.00s
Emit time:                  0.00s
Total time:                 0.31s
`;

const FIXTURE_7 = `Files:              83
Lines:           58446
Identifiers:     49723
Symbols:         32795
Types:             343
Instantiations:     21
Memory used:    25540K
Memory allocs:   42135
Config time:    0.002s
Parse time:     0.015s
Bind time:      0.004s
Check time:     0.025s
Emit time:      0.000s
Total time:     0.040s
`;

const roots: string[] = [];

function tempProject(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'cerial-bench-compilers-'));
  roots.push(dir);
  const compilerOptions = { strict: true, noEmit: true, skipLibCheck: true, types: [] };
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions, include: ['**/*.ts'] }));

  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), text);
  }

  return dir;
}

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

describe('parseExtendedDiagnostics', () => {
  test('reads the 5.9 format', () => {
    expect(parseExtendedDiagnostics(FIXTURE_59)).toEqual({
      checkSeconds: 0.2,
      totalSeconds: 0.31,
      types: 88,
      instantiations: 12,
      memoryKb: 49146,
    });
  });

  test('reads the 7 format', () => {
    expect(parseExtendedDiagnostics(FIXTURE_7)).toEqual({
      checkSeconds: 0.025,
      totalSeconds: 0.04,
      types: 343,
      instantiations: 21,
      memoryKb: 25540,
    });
  });

  test('returns null for text without a diagnostics block', () => {
    expect(parseExtendedDiagnostics('error TS5058: The specified path does not exist')).toBeNull();
    expect(parseExtendedDiagnostics('')).toBeNull();
  });

  test('returns null when one metric is missing', () => {
    expect(parseExtendedDiagnostics(FIXTURE_7.replace(/^Instantiations:.*\n/m, ''))).toBeNull();
  });
});

describe('parseTscErrors', () => {
  test('resolves the file against the working directory and keeps the message', () => {
    const text = "gen/a.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.\n";
    const [error] = parseTscErrors(text, '/work/case');
    expect(error?.file).toBe('/work/case/gen/a.ts');
    expect(error?.message).toContain('TS2322');
  });

  test('ignores diagnostics output that is not an error line', () => {
    expect(parseTscErrors(FIXTURE_7, '/work')).toEqual([]);
  });
});

describe('compilerBin', () => {
  test.each<Compiler>(['5.9', '7'])('resolves the pinned %s binary from node_modules', (compiler) => {
    const bin = compilerBin(compiler);
    expect(existsSync(bin)).toBe(true);
    expect(bin).toContain('node_modules');
  });

  test('the pinned binaries are different packages', () => {
    expect(compilerBin('5.9')).not.toBe(compilerBin('7'));
  });
});

describe('runTsc', () => {
  test.each<Compiler>(['5.9', '7'])('%s returns metrics for a clean project', async (compiler) => {
    const dir = tempProject({ 'gen/a.ts': 'export type T<X> = X extends string ? 1 : 2;\n' });
    const result = await runTsc(compiler, dir, { countedRoots: [join(dir, 'gen')] });
    expect(result.state).toBe('ok');
    expect(result.exitCode).toBe(0);
    expect(result.metrics?.types).toBeGreaterThan(0);
    expect(result.metrics?.memoryKb).toBeGreaterThan(0);
  });

  test.each<Compiler>(['5.9', '7'])('%s fails with the first error under a counted root', async (compiler) => {
    const dir = tempProject({
      'gen/a.ts': 'export const a: number = "first";\n',
      'gen/b.ts': 'export const b: number = "second";\n',
    });
    const run = runTsc(compiler, dir, { countedRoots: [join(dir, 'gen')] });
    await expect(run).rejects.toThrow(/gen\/a\.ts.*TS2322/);
  });

  test.each<Compiler>(['5.9', '7'])('%s does not count errors outside the counted roots', async (compiler) => {
    const dir = tempProject({
      'gen/a.ts': 'export const a: number = 1;\n',
      'dist/x.ts': 'export const x: number = "ignored";\n',
    });
    const result = await runTsc(compiler, dir, { countedRoots: [join(dir, 'gen')] });
    expect(result.state).toBe('ok');
    expect(result.ignoredErrors).toBe(1);
    expect(result.exitCode).not.toBe(0);
  });

  test('a root that only shares a name prefix does not count', async () => {
    const dir = tempProject({ 'generated-extra/x.ts': 'export const x: number = "prefix";\n' });
    const result = await runTsc('7', dir, { countedRoots: [join(dir, 'gen')] });
    expect(result.ignoredErrors).toBe(1);
  });

  test('a heap crash is a reported state on 5.9, not a thrown failure', async () => {
    const dir = tempProject({ 'gen/a.ts': 'export const a = 1;\n' });
    const result = await runTsc('5.9', dir, { countedRoots: [dir], maxOldSpaceMb: 8 });
    expect(result.state).toBe('heap-exhausted');
    expect(result.metrics).toBeNull();
  });

  test('the same project under the default heap does not report heap-exhausted', async () => {
    const dir = tempProject({ 'gen/a.ts': 'export const a = 1;\n' });
    const result = await runTsc('5.9', dir, { countedRoots: [dir] });
    expect(result.state).toBe('ok');
  });

  test('a missing project is a harness failure', async () => {
    const dir = tempProject({});
    rmSync(join(dir, 'tsconfig.json'));
    await expect(runTsc('7', dir, { countedRoots: [dir] })).rejects.toThrow(/printed no diagnostics/);
  });
});
