import { afterAll, describe, expect, it } from 'bun:test';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { syncHandles } from '../../../../src/generators/handles';
import { parseSchema, scratchProject, typecheckProject } from './helpers';

const WITH_TITLE = 'model Post {\n  id Record(int) @id\n  title String\n  body String\n}\n';
const WITHOUT_TITLE = 'model Post {\n  id Record(int) @id\n  body String\n}\n';

const USER = `import { model, f } from 'cerial/schema';
import { Post } from './cerial/handles';

export const Draft = model('Draft', { note: f.string() }, { extends: Post.pick('id', 'title') });
`;

const dirs: string[] = [];
afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

describe('a field removed from a .cerial model', () => {
  it('stops a TypeScript pick list naming it from compiling, once handles are regenerated', async () => {
    const dir = await scratchProject();
    dirs.push(dir);
    await writeFile(join(dir, 'user.ts'), USER);

    expect(await syncHandles(dir, parseSchema(WITH_TITLE))).toBe('written');
    const before = await typecheckProject(dir);
    expect(before.code, before.out).toBe(0);

    expect(await syncHandles(dir, parseSchema(WITHOUT_TITLE))).toBe('written');
    const after = await typecheckProject(dir);
    expect(after.code).not.toBe(0);
    expect(after.out).toContain('"title"');
  }, 120_000);

  it('leaves the pick list compiling while the field is still declared', async () => {
    const dir = await scratchProject();
    dirs.push(dir);
    await writeFile(join(dir, 'user.ts'), USER);
    await syncHandles(dir, parseSchema(WITH_TITLE));

    // Changing a field the pick list does not name rewrites the handles but breaks nothing
    const other = WITH_TITLE.replace('body String', 'summary String');
    expect(await syncHandles(dir, parseSchema(other))).toBe('written');
    const result = await typecheckProject(dir);
    expect(result.code, result.out).toBe(0);
  }, 120_000);
});
