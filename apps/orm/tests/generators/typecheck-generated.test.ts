/**
 * `typecheck:generated` must fail on what `skipLibCheck: true` hides in a declaration file, and
 * only on that tree. Each case is a negative paired with the unseeded positive.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type CompilerChoice, typecheckGenerated } from '../e2e/typecheck-generated';

const GENERATED = resolve(import.meta.dir, '../e2e/generated');
/** The folders `.d.ts` applies to: type-only, so a declaration file can hold them */
const TYPE_ONLY = ['models', 'objects', 'tuples', 'literals'];
const COMPILERS: readonly CompilerChoice[] = ['5.9', '7'];

let scratch: string;
let counter = 0;

/** A copy of the generated tree whose type-only files are `.d.ts`; `seed` edits it before the run */
function seededCopy(seed?: (root: string) => void): string {
  const root = join(scratch, `tree-${counter++}`);
  cpSync(GENERATED, root, { recursive: true });
  for (const dir of TYPE_ONLY) {
    for (const file of readdirSync(join(root, dir))) {
      if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
        renameSync(join(root, dir, file), join(root, dir, file.replace(/\.ts$/, '.d.ts')));
      }
    }
  }
  seed?.(root);

  return root;
}

beforeAll(() => {
  if (!existsSync(GENERATED)) throw new Error('Run `bun run generate:test-client` first');
  scratch = mkdtempSync(join(tmpdir(), 'cerial-typecheck-generated-test-'));
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe.each(COMPILERS)('typecheck:generated under %s', (compiler) => {
  test('passes on the unseeded tree as .d.ts files', async () => {
    const result = await typecheckGenerated(seededCopy(), compiler);

    expect(result.errors.map((error) => error.message)).toEqual([]);
  });

  test('fails on an undefined name in a declaration file', async () => {
    const root = seededCopy((dir) => {
      writeFileSync(
        join(dir, 'models/user.d.ts'),
        `${readFileSync(join(dir, 'models/user.d.ts'), 'utf8')}\nexport type Bad = NotDefined;\n`,
      );
    });
    const result = await typecheckGenerated(root, compiler);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((error) => error.message.includes('NotDefined'))).toBe(true);
  });

  test('fails on a deleted import that skipLibCheck would turn into any', async () => {
    const file = 'models/user.d.ts';
    const source = readFileSync(join(GENERATED, 'models/user.d.ts'), 'utf8');
    const removed = "import type { RecordIdInput } from 'cerial';\n";
    // The import must be both present and used, or the case proves nothing
    expect(source).toContain(removed);
    expect(source.split('RecordIdInput').length).toBeGreaterThan(2);

    const result = await typecheckGenerated(
      seededCopy((dir) => writeFileSync(join(dir, file), readFileSync(join(dir, file), 'utf8').replace(removed, ''))),
      compiler,
    );

    expect(result.errors.some((error) => error.message.includes('RecordIdInput'))).toBe(true);
  });

  test('ignores errors outside the tree', async () => {
    const root = seededCopy();
    // Imported from inside the tree, so the program holds it, but it lives beside the tree rather than under it
    const outside = join(scratch, `outside-${counter++}`);
    mkdirSync(outside);
    writeFileSync(join(outside, 'broken.ts'), 'export type Broken = NotDefined;\n');
    writeFileSync(join(root, 'reach-out.d.ts'), `export type { Broken } from '${join(outside, 'broken.ts')}';\n`);
    const result = await typecheckGenerated(root, compiler);

    expect(result.errors.map((error) => error.message)).toEqual([]);
    expect(result.ignoredErrors).toBeGreaterThan(0);
  });
});
