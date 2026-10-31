import { afterAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { CerialGenerationError } from '../../../../src/errors';
import { readModuleImports } from '../../../../src/parser/builder/load';
import { removeTempProjects, tempProject } from '../../../registration-project';

afterAll(removeTempProjects);

const MODULES = {
  'a.ts': 'export const a = 1;\n',
  'b.ts': 'export const b = 2;\n',
  'c.ts': 'export const c = 3;\n',
};

/** The module names `entry.ts` leads to, relative to the project */
async function edges(entry: string, files: Record<string, string> = {}): Promise<string[]> {
  const dir = await tempProject({ ...MODULES, ...files, 'entry.ts': entry });
  const found = await readModuleImports(join(dir, 'entry.ts'));

  return found.map((path) => path.slice(dir.length + 1)).sort();
}

describe('readModuleImports follows', () => {
  test('a value import, extensionless', async () => {
    expect(await edges("import { a } from './a';\nconsole.log(a);\n")).toEqual(['a.ts']);
  });

  test('a side-effect import and an import with an explicit extension', async () => {
    expect(await edges("import './a';\nimport { b } from './b.ts';\nconsole.log(b);\n")).toEqual(['a.ts', 'b.ts']);
  });

  test('a default and a namespace import', async () => {
    const dir = await tempProject({ 'a.ts': 'export default 1;\n', 'b.ts': 'export const b = 1;\n' });
    await Bun.write(join(dir, 'entry.ts'), "import a from './a';\nimport * as b from './b';\nconsole.log(a, b);\n");

    expect((await readModuleImports(join(dir, 'entry.ts'))).length).toBe(2);
  });

  test('export * from, export { x } from and export * as ns from', async () => {
    const entry = "export * from './a';\nexport { b } from './b';\nexport * as c from './c';\n";

    expect(await edges(entry)).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  test('an import with one type-only and one value specifier', async () => {
    expect(await edges("import { type A, a } from './a';\nconsole.log(a);\n")).toEqual(['a.ts']);
  });

  test('a folder import, to its index', async () => {
    expect(
      await edges("import { x } from './dir';\nconsole.log(x);\n", { 'dir/index.ts': 'export const x = 1;\n' }),
    ).toEqual(['dir/index.ts']);
  });

  test('the same module reached twice, once', async () => {
    expect(await edges("import './a';\nimport { a } from './a';\nexport { a } from './a';\n")).toEqual(['a.ts']);
  });
});

describe('readModuleImports does not follow', () => {
  test('an import commented out, in either comment style', async () => {
    const entry = "// import './a';\n/* import './b'; */\n/*\nimport './c';\n*/\nexport const x = 1;\n";

    expect(await edges(entry)).toEqual([]);
  });

  test('import text inside a string or template', async () => {
    expect(await edges("export const x = \"import './a'\";\nexport const y = `import './b'`;\n")).toEqual([]);
  });

  test('import type, whatever it imports', async () => {
    const entry = "import type { A } from './a';\nimport type B from './b';\nimport type * as C from './c';\n";

    expect(await edges(entry)).toEqual([]);
  });

  test('an import whose every specifier is type-only', async () => {
    expect(await edges("import { type A, type B } from './a';\n")).toEqual([]);
  });

  test('export type', async () => {
    const entry = "export type { A } from './a';\nexport type * from './b';\nexport { type C } from './c';\n";

    expect(await edges(entry)).toEqual([]);
  });

  test('a dynamic import', async () => {
    expect(await edges("export const load = () => import('./a');\n")).toEqual([]);
  });

  test('a specifier nothing resolves', async () => {
    expect(await edges("import { x } from './missing';\nimport { y } from 'no-such-package';\n")).toEqual([]);
  });

  test('a file outside TypeScript: JavaScript, JSON, a declaration file', async () => {
    const files = { 'plain.js': 'export const p = 1;\n', 'data.json': '{}', 'types.d.ts': 'export type T = 1;\n' };

    expect(await edges("import './plain.js';\nimport data from './data.json' with { type: 'json' };\n", files)).toEqual(
      [],
    );
  });

  test('anything in node_modules', async () => {
    const files = {
      'node_modules/pkg/package.json': JSON.stringify({ name: 'pkg', main: 'index.ts' }),
      'node_modules/pkg/index.ts': 'export const p = 1;\n',
    };

    expect(await edges("import { p } from 'pkg';\nconsole.log(p);\n", files)).toEqual([]);
  });

  test('the generated cerial/handles.ts', async () => {
    const files = { 'cerial/handles.ts': 'export {};\n' };

    expect(await edges("import './cerial/handles';\nimport './a';\n", files)).toEqual(['a.ts']);
  });
});

describe('readModuleImports resolves like the runtime', () => {
  test.skipIf(!process.versions.bun)('a tsconfig paths alias', async () => {
    const files = {
      'tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@app/*': ['src/*'] } } }),
      'src/users/user.ts': 'export const user = 1;\n',
    };

    expect(await edges("import { user } from '@app/users/user';\nconsole.log(user);\n", files)).toEqual([
      'src/users/user.ts',
    ]);
  });

  test('an alias nothing defines is skipped, not an error', async () => {
    expect(await edges("import { user } from '@app/users/user';\nconsole.log(user);\n")).toEqual([]);
  });
});

describe('readModuleImports refuses', () => {
  test('a file it cannot read, naming it', async () => {
    const missing = join(await tempProject({}), 'gone.ts');

    const error = await readModuleImports(missing).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CerialGenerationError);
    expect((error as CerialGenerationError).message).toContain(missing);
  });
});
