/**
 * The layout `typeFiles` selects: type-only files as `.d.ts` (the default) or `.ts`, enums always `.ts`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
// The compiler API at a pinned version: TypeScript 7 has none, and CI swaps `typescript` for the latest
import ts from 'typescript-5.9';
import type { TypeFilesMode } from '../../../src/cli/config';
import { generateSingleSchema } from '../../../src/cli/generate';
import { singleSchemaOptions } from '../../../src/cli/watcher';
import { SCHEMAS_DIR } from '../../generators/parity-corpus';

const TYPE_ONLY = ['models', 'objects', 'tuples', 'literals'] as const;
const SCHEMA = `model User {
  id Record @id
  name String
  address Address
  point Point
  level Level
  role Role
}
object Address {
  street String
}
tuple Point {
  x Float,
  y Float
}
literal Level { 1, 2 }
enum Role { ADMIN, USER }
`;

const dirs: string[] = [];
let schemaDir: string;

const tempDir = (label: string): string => {
  const dir = mkdtempSync(join(tmpdir(), `cerial-type-files-${label}-`));
  dirs.push(dir);

  return dir;
};

/** Every file under `dir`, relative, sorted */
function listFiles(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      // The manifest records this layout's files; it is not one of them
      else if (entry.name !== '.cerial-output.json') found.push(relative(dir, path));
    }
  };
  walk(dir);

  return found.sort();
}

async function quietly<T>(run: () => Promise<T>): Promise<T> {
  const { log, info, warn, error } = console;
  console.log = console.info = console.warn = console.error = () => {};
  try {
    return await run();
  } finally {
    Object.assign(console, { log, info, warn, error });
  }
}

async function generateInto(
  outputDir: string,
  typeFiles?: TypeFilesMode,
  options: { schemaPath?: string; clean?: boolean } = {},
): Promise<string[]> {
  const result = await quietly(() =>
    generateSingleSchema({
      schemaPath: options.schemaPath ?? schemaDir,
      outputDir,
      logLevel: 'minimal',
      clean: options.clean,
      typeFiles,
    }),
  );
  if (!result.success) throw new Error(result.errors.join('; '));

  return listFiles(outputDir);
}

const inKind = (files: string[], kind: string): string[] => files.filter((f) => f.startsWith(`${kind}/`));

beforeAll(() => {
  schemaDir = tempDir('schema');
  writeFileSync(join(schemaDir, 'app.cerial'), SCHEMA);
});

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe('the default layout', () => {
  it('emits models, objects, tuples and literals, and their barrels, as .d.ts, and enums as .ts', async () => {
    const files = await generateInto(tempDir('default'));

    for (const kind of TYPE_ONLY) {
      const own = inKind(files, kind);

      expect(own.length).toBeGreaterThan(1);
      expect(own.every((f) => f.endsWith('.d.ts'))).toBe(true);
      expect(own).toContain(`${kind}/index.d.ts`);
    }
    expect(inKind(files, 'enums')).toEqual(['enums/index.ts', 'enums/role.ts']);
    expect(files).toContain('client.ts');
    expect(files).toContain('index.ts');
  });

  it("under typeFiles: 'ts' writes the plain .ts layout", async () => {
    const files = await generateInto(tempDir('ts'), 'ts');

    for (const kind of TYPE_ONLY) {
      expect(inKind(files, kind).every((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))).toBe(true);
    }
    expect(files.some((f) => f.endsWith('.d.ts'))).toBe(false);
  });

  it("'dts' and 'ts' hold the same files under mapped names with identical content", async () => {
    const dtsDir = tempDir('same-dts');
    const tsDir = tempDir('same-ts');
    const dts = await generateInto(dtsDir, 'dts');
    const ts = await generateInto(tsDir, 'ts');

    expect(dts.map((f) => f.replace(/\.d\.ts$/, '.ts'))).toEqual(ts);
    for (const file of dts) {
      expect(readFileSync(join(dtsDir, file), 'utf8')).toBe(
        readFileSync(join(tsDir, file.replace(/\.d\.ts$/, '.ts')), 'utf8'),
      );
    }
  });
});

describe('a type-only file has no value export', () => {
  /** Statements that would give the file a runtime export. Imports are fine: a declaration file elides them. */
  function valueStatements(path: string): string[] {
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);

    return source.statements
      .filter((s) => {
        if (ts.isTypeAliasDeclaration(s) || ts.isInterfaceDeclaration(s) || ts.isImportDeclaration(s)) return false;
        if (ts.isExportDeclaration(s)) return !s.isTypeOnly;

        return true;
      })
      .map((s) => s.getText(source).split('\n')[0]!);
  }

  it('holds for every model, object, tuple and literal file of the e2e corpus', async () => {
    const outputDir = tempDir('corpus');
    const files = await generateInto(outputDir, 'dts', { schemaPath: SCHEMAS_DIR });
    const typeOnly = files.filter((f) => TYPE_ONLY.some((kind) => f.startsWith(`${kind}/`)));

    expect(typeOnly.length).toBeGreaterThan(300);
    const offenders = typeOnly.flatMap((f) => valueStatements(join(outputDir, f)).map((s) => `${f}: ${s}`));

    expect(offenders).toEqual([]);
  });

  it('is not vacuous: the check flags a value export', () => {
    const dir = tempDir('probe');
    writeFileSync(join(dir, 'bad.d.ts'), "import type { A } from './a';\nexport type B = A;\nexport const c = 1;\n");

    expect(valueStatements(join(dir, 'bad.d.ts'))).toEqual(['export const c = 1;']);
  });
});

describe('switching layouts without --clean', () => {
  it('.ts files then a dts run leave no file beside its twin, and the new files survive', async () => {
    const outputDir = tempDir('up-dts');
    await generateInto(outputDir, 'ts');
    const files = await generateInto(outputDir, 'dts');

    for (const kind of TYPE_ONLY) {
      expect(inKind(files, kind).every((f) => f.endsWith('.d.ts'))).toBe(true);
      expect(inKind(files, kind)).toContain(`${kind}/index.d.ts`);
    }
    expect(files).toEqual(await generateInto(tempDir('fresh-dts'), 'dts'));
    expect(existsSync(join(outputDir, 'models', 'user.d.ts'))).toBe(true);
  });

  it('.d.ts files then a ts run leave no file beside its twin, and the new files survive', async () => {
    const outputDir = tempDir('up-ts');
    await generateInto(outputDir, 'dts');
    const files = await generateInto(outputDir, 'ts');

    expect(files.some((f) => f.endsWith('.d.ts'))).toBe(false);
    expect(files).toEqual(await generateInto(tempDir('fresh-ts'), 'ts'));
    expect(existsSync(join(outputDir, 'models', 'user.ts'))).toBe(true);
  });

  it('a second run of the same layout removes nothing it just wrote', async () => {
    const outputDir = tempDir('rerun');
    const once = await generateInto(outputDir, 'dts');

    expect(await generateInto(outputDir, 'dts')).toEqual(once);
  });

  it('--clean also leaves only the chosen layout', async () => {
    const outputDir = tempDir('clean');
    await generateInto(outputDir, 'ts');
    const files = await generateInto(outputDir, 'dts', { clean: true });

    expect(files.some((f) => /^(models|objects|tuples|literals)\/[^/]+(?<!\.d)\.ts$/.test(f))).toBe(false);
  });
});

describe('medium logging', () => {
  async function logged(typeFiles: TypeFilesMode): Promise<string> {
    const lines: string[] = [];
    const { log } = console;
    console.log = (...args: unknown[]) => void lines.push(args.join(' '));
    try {
      const result = await generateSingleSchema({
        schemaPath: schemaDir,
        outputDir: tempDir(`log-${typeFiles}`),
        logLevel: 'medium',
        typeFiles,
      });
      if (!result.success) throw new Error(result.errors.join('; '));
    } finally {
      console.log = log;
    }

    return lines.join('\n');
  }

  it('counts one model file and leaves the barrel out in both layouts', async () => {
    for (const mode of ['dts', 'ts'] as const) {
      const text = await logged(mode);

      expect(text).toContain('  1 model files');
    }
  });

  it('reports the same client file count in both layouts', async () => {
    const pick = (text: string): string => /\d+ client files/.exec(text)![0];

    expect(pick(await logged('dts'))).toBe(pick(await logged('ts')));
  });
});

describe('a watch-mode regeneration', () => {
  const target = (typeFiles?: TypeFilesMode): ReturnType<typeof singleSchemaOptions> =>
    singleSchemaOptions({ schemaPath: schemaDir, outputDir: tempDir('watch'), typeFiles });

  it("honours typeFiles: 'ts'", async () => {
    const options = target('ts');
    const result = await quietly(() => generateSingleSchema(options));

    expect(result.success).toBe(true);
    expect(existsSync(join(options.outputDir, 'models', 'user.ts'))).toBe(true);
    expect(existsSync(join(options.outputDir, 'models', 'user.d.ts'))).toBe(false);
  });

  it('writes the default layout when the target has none, as a one-shot run does', async () => {
    const options = target();
    const result = await quietly(() => generateSingleSchema(options));

    expect(result.success).toBe(true);
    expect(existsSync(join(options.outputDir, 'models', 'user.d.ts'))).toBe(true);
    expect(existsSync(join(options.outputDir, 'models', 'user.ts'))).toBe(false);
  });
});
