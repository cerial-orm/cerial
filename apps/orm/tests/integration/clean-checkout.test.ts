/**
 * A fresh clone has no `cerial/handles.ts`, yet the TypeScript modules import it. Pass 1 writes it before any
 * module is loaded, so generation works under every discovery mode, and pass 1 gets there without reading a
 * TypeScript file. Needs no database.
 */

import { afterAll, afterEach, describe, expect, it, spyOn } from 'bun:test';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { runPassOne } from '../../src/cli/passes';
import { handlesPath } from '../../src/generators/handles';
import type { SchemaAstOptions } from '../../src/cli/resolvers/schema-ast';
import { buildResolvedSchemaAst } from '../../src/cli/resolvers';
import { mixedProject, ORDERS_MODULE, removeMixedProjects, SHOP_CERIAL } from './mixed-merge-project';

afterAll(removeMixedProjects);

const ENTRY =
  "import { defineSchema } from 'cerial/schema';\nimport { Purchase } from './orders';\n\nexport default defineSchema({ models: [Purchase] });\n";
const MODELS = ['Customer', 'Purchase', 'Shop'];

interface Mode {
  readonly files: Record<string, string>;
  readonly options: (dir: string) => SchemaAstOptions;
}

const MODES: Record<string, Mode> = {
  convention: {
    files: { 'shop.cerial': SHOP_CERIAL, 'orders.schema.ts': ORDERS_MODULE },
    options: (dir) => ({ schemaPath: dir }),
  },
  registration: {
    files: { 'shop.cerial': SHOP_CERIAL, 'orders.ts': ORDERS_MODULE, 'entry.ts': ENTRY },
    options: (dir) => ({ schemaPath: dir, entry: join(dir, 'entry.ts') }),
  },
  'explicit list': {
    files: { 'shop.cerial': SHOP_CERIAL, 'orders.ts': ORDERS_MODULE },
    options: (dir) => ({ schemaPath: dir, files: [join(dir, 'orders.ts')] }),
  },
  mixed: {
    files: {
      'shop.cerial': SHOP_CERIAL,
      'orders.schema.ts': ORDERS_MODULE,
      'entry.ts': ENTRY.replace('./orders', './orders.schema'),
    },
    options: (dir) => ({
      schemaPath: dir,
      entry: join(dir, 'entry.ts'),
      files: [join(dir, 'orders.schema.ts'), join(dir, 'shop.cerial')],
    }),
  },
};

describe.each(Object.entries(MODES))('clean checkout under %s discovery', (_name, mode) => {
  async function generate(dir: string): Promise<string[]> {
    const built = await buildResolvedSchemaAst(mode.options(dir));

    expect(built.parseErrors).toEqual([]);
    expect(built.extendsErrors).toEqual([]);

    return (built.resolvedAST?.models ?? []).map((m) => m.name).sort();
  }

  it('generates with no handles file on disk, and leaves one behind', async () => {
    const dir = await mixedProject(mode.files);
    const handles = handlesPath(dir);
    expect(fs.existsSync(handles)).toBe(false);

    expect(await generate(dir)).toEqual(MODELS);
    expect(fs.existsSync(handles)).toBe(true);
  });

  it('generates again after the handles file is deleted, rather than relying on its absence', async () => {
    const dir = await mixedProject(mode.files);
    await generate(dir);

    await rm(handlesPath(dir));

    expect(await generate(dir)).toEqual(MODELS);
    expect(fs.existsSync(handlesPath(dir))).toBe(true);
  });

  it('generates over a stale handles file the generator wrote', async () => {
    const dir = await mixedProject(mode.files);
    await generate(dir);
    await fsPromises.appendFile(handlesPath(dir), '\n// stale\n');

    expect(await generate(dir)).toEqual(MODELS);
    expect(await fsPromises.readFile(handlesPath(dir), 'utf-8')).not.toContain('// stale');
  });
});

describe('pass 1 and TypeScript files', () => {
  afterEach(() => {
    spies.splice(0).forEach((spy) => spy.mockRestore());
  });

  const spies: Array<{ mockRestore: () => void }> = [];
  const touched: string[] = [];

  /** Record the path of every filesystem call pass 1 could use to look at a file, whatever it does next */
  function watch(): void {
    touched.length = 0;
    const record = (name: string) => (path: unknown) => void touched.push(`${name} ${String(path)}`);
    for (const name of [
      'existsSync',
      'statSync',
      'lstatSync',
      'readFileSync',
      'readdirSync',
      'openSync',
      'opendirSync',
    ] as const) {
      const real = fs[name] as (...args: unknown[]) => unknown;
      const note = record(name);
      spies.push(
        spyOn(fs, name).mockImplementation(((path: unknown, ...rest: unknown[]) => {
          note(path);

          return real(path, ...rest);
        }) as never),
      );
    }
    for (const name of ['readFile', 'readdir', 'stat', 'lstat', 'open', 'opendir', 'glob', 'access'] as const) {
      const real = fsPromises[name] as (...args: unknown[]) => Promise<unknown>;
      const note = record(name);
      spies.push(
        spyOn(fsPromises, name).mockImplementation(((path: unknown, ...rest: unknown[]) => {
          note(path);

          return real(path, ...rest);
        }) as never),
      );
    }
  }

  it('reads no TypeScript file and lists no directory but the handles one', async () => {
    const dir = await mixedProject({
      'shop.cerial': SHOP_CERIAL,
      'orders.schema.ts': ORDERS_MODULE,
      'poison.schema.ts': "throw new Error('pass 1 must not load this');\n",
    });
    // Pass 1 does read the handles module to check it is its own, which shows the spies see a read
    await runPassOne([{ path: join(dir, 'shop.cerial'), content: SHOP_CERIAL }], dir);
    watch();

    await runPassOne([{ path: join(dir, 'shop.cerial'), content: SHOP_CERIAL }], dir);

    const handles = handlesPath(dir);
    const typescript = touched.filter((call) => /\.ts$/.test(call) && !call.endsWith(` ${handles}`));
    expect(touched.some((call) => call === `readFile ${handles}`)).toBe(true);
    expect(typescript).toEqual([]);
    const listed = touched.filter((call) => /^(readdir|readdirSync|opendir|opendirSync|glob) /.test(call));
    expect(listed.every((call) => call.endsWith(` ${dirname(handles)}`))).toBe(true);
  });
});
