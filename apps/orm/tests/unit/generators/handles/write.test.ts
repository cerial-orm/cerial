import { afterEach, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitHandles, handlesPath, HANDLES_MARKER, syncHandles } from '../../../../src/generators/handles';
import { formatCode } from '../../../../src/generators/shared';
import { parseSchema } from './helpers';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function root(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cerial-handles-'));
  dirs.push(dir);

  return dir;
}

const ast = () => parseSchema('model User {\n  id Record(int) @id\n  name String\n}');

describe('syncHandles', () => {
  it('writes the formatted module under <root>/cerial/handles.ts', async () => {
    const dir = await root();
    expect(await syncHandles(dir, ast())).toBe('written');
    const written = await readFile(handlesPath(dir), 'utf-8');
    expect(written).toBe(await formatCode(emitHandles(ast()), dir));
    expect(written.startsWith(HANDLES_MARKER)).toBe(true);
  });

  it('leaves an identical file alone', async () => {
    const dir = await root();
    await syncHandles(dir, ast());
    expect(await syncHandles(dir, ast())).toBe('unchanged');
  });

  it('replaces a marked file whose declarations changed', async () => {
    const dir = await root();
    await syncHandles(dir, ast());
    expect(await syncHandles(dir, parseSchema('model User {\n  id Record @id\n}'))).toBe('written');
    expect(await readFile(handlesPath(dir), 'utf-8')).not.toContain('"name"');
  });

  it('refuses an unmarked file at the path, naming it, and leaves it as it was', async () => {
    const dir = await root();
    await mkdir(join(dir, 'cerial'));
    await writeFile(handlesPath(dir), 'export const mine = 1;\n');
    await expect(syncHandles(dir, ast())).rejects.toThrow(handlesPath(dir));
    expect(await readFile(handlesPath(dir), 'utf-8')).toBe('export const mine = 1;\n');
  });

  it('removes a marked file, and its folder, when the entry stops mixing', async () => {
    const dir = await root();
    await syncHandles(dir, ast());
    expect(await syncHandles(dir, null)).toBe('removed');
    expect(existsSync(handlesPath(dir))).toBe(false);
    expect(existsSync(join(dir, 'cerial'))).toBe(false);
  });

  it('keeps the folder when something else lives in it', async () => {
    const dir = await root();
    await syncHandles(dir, ast());
    await writeFile(join(dir, 'cerial', 'other.ts'), '');
    await syncHandles(dir, null);
    expect(existsSync(join(dir, 'cerial', 'other.ts'))).toBe(true);
  });

  it('never removes an unmarked file', async () => {
    const dir = await root();
    await mkdir(join(dir, 'cerial'));
    await writeFile(handlesPath(dir), 'export const mine = 1;\n');
    expect(await syncHandles(dir, null)).toBe('absent');
    expect(existsSync(handlesPath(dir))).toBe(true);
  });

  it('writes nothing when there is nothing to remove', async () => {
    const dir = await root();
    expect(await syncHandles(dir, null)).toBe('absent');
    expect(existsSync(join(dir, 'cerial'))).toBe(false);
  });
});
