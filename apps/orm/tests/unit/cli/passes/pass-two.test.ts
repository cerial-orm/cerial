import { afterAll, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { runPassOne, runPassTwo } from '../../../../src/cli/passes';
import { modelModule, removeTempProjects, tempProject } from '../../../registration-project';

afterAll(removeTempProjects);

const CERIAL = 'model Post {\n  id Record(int) @id\n  title String\n}\n';
const IMPORTS_POST = "import { Post } from './cerial/handles';\nexport const Draft = Post;\n";

async function project(
  user: string,
  cerial: string,
): Promise<{ root: string; file: string; ast: Awaited<ReturnType<typeof runPassOne>> }> {
  const root = await tempProject({ 'user.ts': user });
  const ast = await runPassOne([{ path: 'a.cerial', content: cerial }], root);

  return { root, file: join(root, 'user.ts'), ast };
}

describe('runPassTwo', () => {
  it('imports the modules and collects what they declare', async () => {
    const root = await tempProject({ 'a.ts': modelModule('A'), 'b.ts': modelModule('B') });

    const declarations = await runPassTwo([join(root, 'a.ts'), join(root, 'b.ts')]);

    expect(declarations.map((d) => d.exportName)).toEqual(['A', 'B']);
  });

  it('hands the import to the module loader it was given', async () => {
    const seen: string[] = [];

    const declarations = await runPassTwo(['/virtual/a.ts'], {
      importModule: async (module) => {
        seen.push(module);

        return {};
      },
    });

    expect(seen).toEqual(['/virtual/a.ts']);
    expect(declarations).toEqual([]);
  });

  it('refuses a module importing a handle the regenerated file no longer exports', async () => {
    const { root, file, ast } = await project(IMPORTS_POST, CERIAL.replace('Post', 'Article'));

    const error = await runPassTwo([file], { handles: { root, ast }, importModule: async () => ({}) }).catch(
      (e: Error) => e,
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("'Post'");
    expect((error as Error).message).toContain('renamed or removed');
  });

  it('lets a module through when every handle it imports is still exported', async () => {
    const { root, file, ast } = await project(IMPORTS_POST, CERIAL);

    const declarations = await runPassTwo([file], { handles: { root, ast }, importModule: async () => ({}) });

    expect(declarations).toEqual([]);
  });

  it('does not check imports against handles when none were written', async () => {
    const { file } = await project(IMPORTS_POST, CERIAL.replace('Post', 'Article'));

    await expect(runPassTwo([file], { importModule: async () => ({}) })).resolves.toEqual([]);
  });
});
