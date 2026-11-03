/**
 * A library that re-exports generated types builds with `tsc --declaration --outDir`, which drops the
 * hand-placed `.d.ts` files. The consumer then gets `any` with no error, unless the package copies
 * them or generates `typeFiles: 'ts'`. Each case builds a package and checks a consumer against it.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dirname, join, resolve } from 'node:path';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { type Compiler, compilerBin, parseTscErrors } from '../../bench/compilers';
import { generateSingleSchema } from '../../src/cli/generate';
import type { TypeFilesMode } from '../../src/cli/config/types';

const FIXTURE = resolve(import.meta.dir, '../fixtures/library-consumer');
const ORM = resolve(import.meta.dir, '../..');
const DIST_TYPES = join(ORM, 'dist/index.d.mts');
const TOOLBELT = dirname(Bun.fileURLToPath(import.meta.resolve('ts-toolbelt/package.json')));
/** The text the docs print, so the test runs exactly what a reader copies */
const COPY_STEP = readFileSync(join(FIXTURE, 'copy-step.txt'), 'utf8').trim();
const COMPILERS: readonly Compiler[] = ['5.9', '7'];

const CONSUMER = `import type { User } from '../pkg/dist';

type IsAny<T> = 0 extends 1 & T ? 1 : 0;
export const proof: IsAny<User> = 1;
export const bad: User = 123;
`;

let scratch: string;
let counter = 0;

async function run(compiler: Compiler, cwd: string, args: string[]): Promise<{ exitCode: number; out: string }> {
  const proc = Bun.spawn(['node', compilerBin(compiler), ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);

  return { exitCode, out: stdout + stderr };
}

function writeTsconfig(dir: string, compilerOptions: Record<string, unknown>, include: string[]): void {
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ESNext',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        skipLibCheck: true,
        types: [],
        paths: {
          // The built declarations: pointing at src would pull every source file under the package's rootDir
          cerial: [DIST_TYPES],
          'ts-toolbelt': [join(TOOLBELT, 'out/index.d.ts')],
        },
        ...compilerOptions,
      },
      include,
    }),
  );
}

interface Built {
  readonly root: string;
  readonly pkg: string;
}

/** Generates a client into a package, re-exports `User`, and builds it with declarations into `dist` */
async function buildPackage(
  compiler: Compiler,
  typeFiles: TypeFilesMode,
  copy: boolean,
  gitignore?: string,
): Promise<Built> {
  const root = join(scratch, `case-${counter++}`);
  const pkg = join(root, 'pkg');
  mkdirSync(join(pkg, 'src'), { recursive: true });
  const result = await generateSingleSchema({
    schemaPath: join(FIXTURE, 'schema.cerial'),
    outputDir: join(pkg, 'src/generated'),
    typeFiles,
  });
  if (!result.success) throw new Error(`generate failed: ${result.errors.join('; ')}`);
  writeFileSync(join(pkg, 'src/index.ts'), "export type { User } from './generated';\n");
  if (gitignore) writeFileSync(join(pkg, '.gitignore'), gitignore);
  writeTsconfig(pkg, { declaration: true, outDir: 'dist', rootDir: 'src' }, ['src']);

  const build = await run(compiler, pkg, ['-p', '.']);
  if (build.exitCode) throw new Error(`package build failed under ${compiler}: ${build.out.slice(0, 800)}`);
  if (copy) {
    const step = Bun.spawn(['sh', '-c', COPY_STEP], { cwd: pkg, stdout: 'pipe', stderr: 'pipe' });
    const [err, code] = await Promise.all([step.stderr.text(), step.exited]);
    if (code) throw new Error(`copy step failed: ${err}`);
  }

  return { root, pkg };
}

/** Compiles the consumer against the built package; returns the error lines per variable */
async function consume(compiler: Compiler, built: Built): Promise<{ proof: boolean; bad: boolean; other: string[] }> {
  const dir = join(built.root, 'consumer');
  mkdirSync(dir);
  writeFileSync(join(dir, 'index.ts'), CONSUMER);
  writeTsconfig(dir, { noEmit: true }, ['index.ts']);
  const { out } = await run(compiler, dir, ['-p', '.', '--pretty', 'false']);
  const errors = parseTscErrors(out, dir).map((error) => error.message);

  return {
    proof: errors.some((message) => /index\.ts\(4,/.test(message)),
    bad: errors.some((message) => /index\.ts\(5,/.test(message)),
    other: errors.filter((message) => !/index\.ts\([45],/.test(message)),
  };
}

beforeAll(() => {
  if (!existsSync(DIST_TYPES)) throw new Error('Run `bun run build` first');
  scratch = mkdtempSync(join(tmpdir(), 'cerial-library-consumer-'));
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe.each(COMPILERS)('library consumer under %s', (compiler) => {
  test('dts without the copy step leaves User as any and accepts 123', async () => {
    const result = await consume(compiler, await buildPackage(compiler, 'dts', false));

    // If a compiler ever stops emitting `any` here, the docs warning is stale
    expect(result).toEqual({ proof: false, bad: false, other: [] });
  }, 120_000);

  test('dts with the documented copy step keeps the real type', async () => {
    const result = await consume(compiler, await buildPackage(compiler, 'dts', true));

    expect(result).toEqual({ proof: true, bad: true, other: [] });
  }, 120_000);

  test("typeFiles 'ts' keeps the real type with no copy step", async () => {
    const result = await consume(compiler, await buildPackage(compiler, 'ts', false));

    expect(result).toEqual({ proof: true, bad: true, other: [] });
  }, 120_000);

  test('the copy step is a node one-liner with no shell-specific syntax', () => {
    expect(COPY_STEP.startsWith('node -e "')).toBe(true);
    expect(COPY_STEP).toContain('fs.cpSync');
    expect(COPY_STEP).toContain("endsWith('.d.ts')");
    expect(COPY_STEP).not.toMatch(/\\|\bcp\b/);
  });
});

describe('a .gitignore that lists *.d.ts', () => {
  test('hides the copied declaration files from git', async () => {
    const built = await buildPackage('7', 'dts', true, '*.d.ts\n');
    Bun.spawnSync(['git', 'init', '-q'], { cwd: built.pkg });
    const check = Bun.spawnSync(['git', 'check-ignore', '-q', 'dist/generated/models/user.d.ts'], { cwd: built.pkg });
    const control = Bun.spawnSync(['git', 'check-ignore', '-q', 'src/index.ts'], { cwd: built.pkg });

    // check-ignore exits 0 for an ignored path and 1 for one that is not
    expect(check.exitCode).toBe(0);
    expect(control.exitCode).toBe(1);
  }, 120_000);
});
