import { afterAll, describe, expect, it } from 'bun:test';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { handleExportNames, handlesPath } from '../../../../src/generators/handles';
import { loadDeclarations } from '../../../../src/parser/builder';
import { parseSchema, regenerateHandles, scratchProject } from './helpers';

const BEFORE =
  'model Post {\n  id Record(int) @id\n  title String\n  body String\n}\nobject Tag {\n  label String\n}\n';
const SCHEMA_SRC = "import { model, f } from 'cerial/schema';\n";

const dirs: string[] = [];
afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

async function project(
  user: string,
  source: string,
): Promise<{ user: string; handles: { path: string; exports: string[] } }> {
  const dir = await scratchProject();
  dirs.push(dir);
  await regenerateHandles(dir, source);
  const file = join(dir, 'user.ts');
  await writeFile(
    file,
    user.replace("'cerial/schema'", `'${join(import.meta.dir, '../../../../src/schema/index.ts')}'`),
  );

  return { user: file, handles: { path: handlesPath(dir), exports: handleExportNames(parseSchema(source)) } };
}

const IMPORTS_POST = `${SCHEMA_SRC}import { Post } from './cerial/handles';
export const Draft = model('Draft', { note: f.string() }, { extends: Post.pick('id', 'title') });
`;

describe('a declaration renamed or removed in a .cerial file', () => {
  it('is refused naming the module, the name that went away and what is available', async () => {
    const { user, handles } = await project(IMPORTS_POST, BEFORE.replace('model Post', 'model Article'));

    const error = await loadDeclarations([user], { handles }).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain(user);
    expect(message).toContain("'Post'");
    expect(message).toContain('renamed or removed');
    expect(message).toContain('Article');
    expect(message).not.toMatch(/Cannot find|resolve/i);
  });

  it('is refused for every name a module imports that is gone, not only the first', async () => {
    const two = IMPORTS_POST.replace('{ Post }', '{ Post, Tag }');
    const { user, handles } = await project(two, 'model Other {\n  id Record(int) @id\n}\n');

    const error = (await loadDeclarations([user], { handles }).catch((e: Error) => e)) as Error;

    expect(error.message).toContain("'Post', 'Tag'");
  });

  it('loads when every imported name is still exported', async () => {
    const { user, handles } = await project(IMPORTS_POST, BEFORE);

    const declarations = await loadDeclarations([user], { handles });

    expect(declarations.map((d) => d.exportName)).toEqual(['Draft']);
  });
});

describe('a member removed from a declaration that is still there', () => {
  it('is refused naming the member and the declaration, and saying the handles were regenerated', async () => {
    const { user, handles } = await project(IMPORTS_POST, BEFORE.replace('  title String\n', ''));

    const error = (await loadDeclarations([user], { handles }).catch((e: Error) => e)) as Error;

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(user);
    expect(error.message).toContain("model 'Post' has no member 'title'");
    expect(error.message).toContain('cerial/handles.ts was regenerated');
    expect(error.message).toContain('id, body');
  });

  it('reads differently from a removed declaration', async () => {
    const member = await project(IMPORTS_POST, BEFORE.replace('  title String\n', ''));
    const declaration = await project(IMPORTS_POST, BEFORE.replace('model Post', 'model Article'));

    const memberError = (await loadDeclarations([member.user], { handles: member.handles }).catch(
      (e: Error) => e,
    )) as Error;
    const declarationError = (await loadDeclarations([declaration.user], { handles: declaration.handles }).catch(
      (e: Error) => e,
    )) as Error;

    expect(memberError.message).not.toContain('renamed or removed');
    expect(declarationError.message).not.toContain('has no member');
  });

  it('applies to an omit list too, and to a named tuple element', async () => {
    const omit = await project(
      IMPORTS_POST.replace("pick('id', 'title')", "omit('title')"),
      BEFORE.replace('  title String\n', ''),
    );
    const tuple = await project(
      `${SCHEMA_SRC}import { Pair } from './cerial/handles';\nexport const T = Pair.omit('b');\n`,
      'tuple Pair {\n  a Int,\n  c Int\n}\n',
    );

    const omitError = (await loadDeclarations([omit.user], { handles: omit.handles }).catch((e: Error) => e)) as Error;
    const tupleError = (await loadDeclarations([tuple.user], { handles: tuple.handles }).catch(
      (e: Error) => e,
    )) as Error;

    expect(omitError.message).toContain("no member 'title'");
    expect(tupleError.message).toContain("tuple 'Pair' has no member 'b'");
  });
});
