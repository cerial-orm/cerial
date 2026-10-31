/**
 * A shape change in a .cerial file regenerates `cerial/handles.ts`, and the watcher reacts to it. Needs no database.
 */

import { afterAll, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { shouldTriggerRegeneration } from '../../src/cli/watcher';
import { buildResolvedSchemaAst } from '../../src/cli/resolvers';

const dirs: string[] = [];
afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

const POST = (fields: string): string => `model Post {\n  id Record(int) @id\n${fields}}\n`;

async function entry(cerial: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cerial-handles-regen-'));
  dirs.push(dir);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'a.cerial'), cerial);
  await writeFile(join(dir, 'x.schema.ts'), 'export const noop = 1;\n');

  return dir;
}

const handlesText = (dir: string): Promise<string> => readFile(join(dir, 'cerial', 'handles.ts'), 'utf-8');

describe('a shape change in a .cerial file', () => {
  it('regenerates handles without the removed field, with no declaration renamed', async () => {
    const dir = await entry(POST('  title String\n  body String\n'));
    await buildResolvedSchemaAst({ schemaPath: dir });
    expect(await handlesText(dir)).toContain("members: ['id', 'title', 'body']");

    await writeFile(join(dir, 'a.cerial'), POST('  body String\n'));
    await buildResolvedSchemaAst({ schemaPath: dir });

    expect(await handlesText(dir)).toContain("members: ['id', 'body']");
  });

  it('leaves handles untouched when the edit does not change the shape', async () => {
    const dir = await entry(POST('  title String\n'));
    await buildResolvedSchemaAst({ schemaPath: dir });
    const first = await handlesText(dir);

    await writeFile(join(dir, 'a.cerial'), `// a comment\n${POST('  title String\n')}`);
    await buildResolvedSchemaAst({ schemaPath: dir });

    expect(await handlesText(dir)).toBe(first);
  });
});

describe('the watcher on a shape change', () => {
  const scope = { schemaPath: '/proj', outputDir: '/proj/out' };

  it('triggers on a .cerial file whatever changed in it, and on a TypeScript module', () => {
    expect(shouldTriggerRegeneration('a.cerial', undefined, scope)).toBe(true);
    expect(shouldTriggerRegeneration('sub/b.cerial', undefined, scope)).toBe(true);
    expect(shouldTriggerRegeneration('x.schema.ts', undefined, scope)).toBe(true);
  });

  it('does not trigger on the handles it writes itself, so regeneration cannot loop', () => {
    expect(shouldTriggerRegeneration('cerial/handles.ts', undefined, scope)).toBe(false);
  });
});
