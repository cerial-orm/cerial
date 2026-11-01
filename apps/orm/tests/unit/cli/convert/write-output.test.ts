import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CerialGenerationError } from '../../../../src/errors';
import { planOutputs, type OutputPlan } from '../../../../src/cli/convert/output-paths';
import { writeOutputs, type StagedTree } from '../../../../src/cli/convert/write-output';

let root: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'cerial-write-')));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const hash = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');

async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of (await readdir(dir, { recursive: true })).sort()) {
    const info = await lstat(join(dir, name));
    out[name] = info.isFile()
      ? `${hash(await readFile(join(dir, name)))}@${info.mtimeMs}`
      : info.isDirectory()
        ? 'dir'
        : 'link';
  }

  return out;
}

async function project(files: Record<string, string>): Promise<string> {
  for (const [name, text] of Object.entries(files)) {
    await mkdir(join(root, name, '..'), { recursive: true });
    await writeFile(join(root, name), text);
  }

  return root;
}

function setup(
  sources: string[],
  extra: { outDir?: string; protectedSources?: string[]; keptModules?: string[] } = {},
) {
  const plan = planOutputs({
    sources: sources.map((s) => join(root, s)),
    entryRoot: root,
    toExtension: '.schema.ts',
    ...extra,
  });
  const contents = new Map(plan.outputs.map((o) => [o.source, `// out of ${o.source.split('/').pop()}\n`]));

  return { plan, contents };
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CerialGenerationError);

    return (error as Error).message;
  }
  throw new Error('expected a refusal');
}

const noStageLeft = async (): Promise<void> => {
  expect((await readdir(root)).filter((n) => n.startsWith('.cerial-convert-'))).toEqual([]);
};

describe('writeOutputs positive paths', () => {
  it('writes every output beside its source and leaves sources untouched', async () => {
    await project({ 'a.cerial': 'model A {}\n', 'sub/b.cerial': 'model B {}\n' });
    const { plan, contents } = setup(['a.cerial', 'sub/b.cerial']);

    const result = await writeOutputs(plan, { contents });

    expect(result.written).toEqual([join(root, 'a.schema.ts'), join(root, 'sub/b.schema.ts')]);
    expect(await readFile(join(root, 'sub/b.schema.ts'), 'utf8')).toBe('// out of b.cerial\n');
    expect(hash(await readFile(join(root, 'a.cerial')))).toBe(hash('model A {}\n'));
    await noStageLeft();
    expect((await readdir(root, { recursive: true })).filter((n) => n.includes('cerial-tmp'))).toEqual([]);
  });

  it('writes under -o, creating missing directories', async () => {
    await project({ 'sub/b.cerial': 'x' });
    const { plan, contents } = setup(['sub/b.cerial'], { outDir: join(root, 'out/deep') });

    await writeOutputs(plan, { contents });

    expect(await readFile(join(root, 'out/deep/sub/b.schema.ts'), 'utf8')).toBe('// out of b.cerial\n');
  });

  it('replaces a non-source file under force and keeps its mode', async () => {
    await project({ 'a.cerial': 'x', 'a.schema.ts': 'old' });
    await chmod(join(root, 'a.schema.ts'), 0o640);
    const { plan, contents } = setup(['a.cerial']);

    await writeOutputs(plan, { contents, force: true });

    expect(await readFile(join(root, 'a.schema.ts'), 'utf8')).toBe('// out of a.cerial\n');
    expect((await stat(join(root, 'a.schema.ts'))).mode & 0o777).toBe(0o640);
  });

  it('runs verify against a stage mirroring final names, with kept modules symlinked, and removes it after', async () => {
    await project({ 'sub/b.cerial': 'x', 'helpers/kept.ts': 'export const k = 1;\n' });
    const { plan, contents } = setup(['sub/b.cerial'], { keptModules: [join(root, 'helpers/kept.ts')] });
    let seen: StagedTree | undefined;
    let linked = '';
    let text = '';

    await writeOutputs(plan, {
      contents,
      verify: async (tree) => {
        seen = tree;
        linked = await readFile(join(tree.dir, 'helpers/kept.ts'), 'utf8');
        expect((await lstat(join(tree.dir, 'helpers/kept.ts'))).isSymbolicLink()).toBe(true);
        text = await readFile(join(tree.dir, 'sub/b.schema.ts'), 'utf8');
      },
    });

    expect(seen?.dir.startsWith(join(root, '.cerial-convert-'))).toBe(true);
    expect(linked).toBe('export const k = 1;\n');
    expect(text).toBe('// out of b.cerial\n');
    await noStageLeft();
  });

  it('dry run returns the plan and touches nothing, not even the stage', async () => {
    await project({ 'a.cerial': 'x' });
    const before = await snapshot(root);
    const { plan, contents } = setup(['a.cerial']);
    let verified = false;

    const result = await writeOutputs(plan, { contents, dryRun: true, verify: () => void (verified = true) });

    expect(result).toEqual({ dryRun: true, plan, written: [] });
    expect(verified).toBe(false);
    expect(await snapshot(root)).toEqual(before);
  });
});

describe('writeOutputs preflight refusals', () => {
  it('lists every collision in one refusal and leaves all files unchanged', async () => {
    await project({ 'a.cerial': 'x', 'b.cerial': 'y', 'c.cerial': 'z', 'a.schema.ts': 'oldA', 'b.schema.ts': 'oldB' });
    const before = await snapshot(root);
    const { plan, contents } = setup(['a.cerial', 'b.cerial', 'c.cerial']);

    const message = await refusal(writeOutputs(plan, { contents }));

    expect(message).toContain(join(root, 'a.schema.ts'));
    expect(message).toContain(join(root, 'b.schema.ts'));
    expect(message).not.toContain(join(root, 'c.schema.ts'));
    expect(await snapshot(root)).toEqual(before);
  });

  it('refuses a dry run with the same collisions', async () => {
    await project({ 'a.cerial': 'x', 'a.schema.ts': 'old' });
    const { plan, contents } = setup(['a.cerial']);

    expect(await refusal(writeOutputs(plan, { contents, dryRun: true }))).toContain('already exists');
  });

  it.each([false, true])('refuses a symlink target (force=%p) and leaves what it points at', async (force) => {
    await project({ 'a.cerial': 'x', 'real.txt': 'keep' });
    await symlink(join(root, 'real.txt'), join(root, 'a.schema.ts'));
    const { plan, contents } = setup(['a.cerial']);

    expect(await refusal(writeOutputs(plan, { contents, force }))).toContain('symbolic link');
    expect(await readFile(join(root, 'real.txt'), 'utf8')).toBe('keep');
  });

  it.each([false, true])('refuses a directory target (force=%p)', async (force) => {
    await project({ 'a.cerial': 'x' });
    await mkdir(join(root, 'a.schema.ts'));
    const { plan, contents } = setup(['a.cerial']);

    expect(await refusal(writeOutputs(plan, { contents, force }))).toContain('is a directory');
  });

  it.each([false, true])('refuses an -o that is a file (force=%p)', async (force) => {
    await project({ 'a.cerial': 'x', out: 'i am a file' });
    const { plan, contents } = setup(['a.cerial'], { outDir: join(root, 'out') });

    expect(await refusal(writeOutputs(plan, { contents, force }))).toContain('is a file');
    expect(await readFile(join(root, 'out'), 'utf8')).toBe('i am a file');
  });

  it.each([false, true])('never replaces a protected source, even from another entry (force=%p)', async (force) => {
    await project({ 'a.cerial': 'x', 'other.schema.ts': 'hand written' });
    const { plan, contents } = setup(['a.cerial'], { protectedSources: [join(root, 'other.schema.ts')] });
    const renamedPlan: OutputPlan = {
      ...plan,
      outputs: [{ source: plan.outputs[0]!.source, target: join(root, 'other.schema.ts') }],
    };

    expect(await refusal(writeOutputs(renamedPlan, { contents, force }))).toContain('schema source');
    expect(await readFile(join(root, 'other.schema.ts'), 'utf8')).toBe('hand written');
  });

  it('compares protected sources by realpath, through a symlinked directory', async () => {
    await project({ 'real/other.schema.ts': 'hand written', 'a.cerial': 'x' });
    await symlink(join(root, 'real'), join(root, 'link'));
    const { plan, contents } = setup(['a.cerial'], { protectedSources: [join(root, 'real/other.schema.ts')] });
    const viaLink: OutputPlan = {
      ...plan,
      outputs: [{ source: plan.outputs[0]!.source, target: join(root, 'link/other.schema.ts') }],
    };

    expect(await refusal(writeOutputs(viaLink, { contents, force: true }))).toContain('schema source');
    expect(await readFile(join(root, 'real/other.schema.ts'), 'utf8')).toBe('hand written');
  });

  it('refuses -o outside the entry when a kept module is imported', async () => {
    await project({ 'a.cerial': 'x', 'k.ts': '' });
    const outside = await mkdtemp(join(tmpdir(), 'cerial-out-'));
    try {
      const { plan, contents } = setup(['a.cerial'], { outDir: outside, keptModules: [join(root, 'k.ts')] });

      expect(await refusal(writeOutputs(plan, { contents }))).toContain('kept TypeScript modules');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('lets -o outside the entry through when nothing is kept', async () => {
    await project({ 'a.cerial': 'x' });
    const outside = await mkdtemp(join(tmpdir(), 'cerial-out-'));
    try {
      const { plan, contents } = setup(['a.cerial'], { outDir: outside });
      await writeOutputs(plan, { contents });

      expect(await readFile(join(outside, 'a.schema.ts'), 'utf8')).toBe('// out of a.cerial\n');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe('writeOutputs verify failure', () => {
  it('leaves no target, no temp file and no stage', async () => {
    await project({ 'a.cerial': 'x', 'b.cerial': 'y' });
    const before = await snapshot(root);
    const { plan, contents } = setup(['a.cerial', 'b.cerial']);

    await expect(
      writeOutputs(plan, {
        contents,
        verify: () => {
          throw new CerialGenerationError('differs from the source');
        },
      }),
    ).rejects.toThrow('differs from the source');

    expect(await snapshot(root)).toEqual(before);
  });

  it('leaves a forced target untouched when verify fails', async () => {
    await project({ 'a.cerial': 'x', 'a.schema.ts': 'old' });
    const before = await snapshot(root);
    const { plan, contents } = setup(['a.cerial']);

    await expect(
      writeOutputs(plan, { contents, force: true, verify: () => Promise.reject(new Error('no')) }),
    ).rejects.toThrow('no');

    expect(await snapshot(root)).toEqual(before);
  });
});

describe('writeOutputs rollback', () => {
  async function failingRun(failAt: number, alsoFailRestore = false) {
    await project({ 'a.cerial': 'x', 'b.cerial': 'y', 'c.cerial': 'z', 'a.schema.ts': 'oldA' });
    await chmod(join(root, 'a.schema.ts'), 0o600);
    const { plan, contents } = setup(['a.cerial', 'b.cerial', 'c.cerial'], { outDir: undefined });
    let calls = 0;
    const doRename = async (from: string, to: string): Promise<void> => {
      calls++;
      if (calls === failAt) throw new Error('injected rename failure');
      if (alsoFailRestore && to === join(root, 'a.schema.ts') && calls > failAt)
        throw new Error('injected restore failure');
      await rename(from, to);
    };

    return refusal(writeOutputs(plan, { contents, force: true, rename: doRename }));
  }

  it('removes created files and restores replaced bytes when file 3 of 3 fails', async () => {
    const message = await failingRun(3);

    expect(message).toContain('file 3 of 3');
    expect(message).toContain(`${join(root, 'a.schema.ts')}: replaced, then restored`);
    expect(message).toContain(`${join(root, 'b.schema.ts')}: created, then removed`);
    expect(message).toContain(`${join(root, 'c.schema.ts')}: not written`);
    expect(await readFile(join(root, 'a.schema.ts'), 'utf8')).toBe('oldA');
    expect((await stat(join(root, 'a.schema.ts'))).mode & 0o777).toBe(0o600);
    await expect(stat(join(root, 'b.schema.ts'))).rejects.toThrow();
    await expect(stat(join(root, 'c.schema.ts'))).rejects.toThrow();
    expect(await readFile(join(root, 'a.cerial'), 'utf8')).toBe('x');
    expect(await readFile(join(root, 'c.cerial'), 'utf8')).toBe('z');
    await noStageLeft();
    expect((await readdir(root)).filter((n) => n.includes('cerial-tmp') || n.includes('cerial-restore'))).toEqual([]);
  });

  it('marks the untouched replaced file unchanged when the first rename fails', async () => {
    const message = await failingRun(1);

    expect(message).toContain('file 1 of 3');
    expect(message).toContain(`${join(root, 'a.schema.ts')}: unchanged`);
    expect(await readFile(join(root, 'a.schema.ts'), 'utf8')).toBe('oldA');
  });

  it('names what it could not restore instead of reporting success', async () => {
    const message = await failingRun(3, true);

    expect(message).toContain(`${join(root, 'a.schema.ts')}: NOT RESTORED`);
    expect(message).toContain('injected restore failure');
    expect(message).toContain(`${join(root, 'b.schema.ts')}: created, then removed`);
    expect((await readdir(root)).filter((n) => n.includes('cerial-restore'))).toEqual([]);
    await noStageLeft();
  });

  it('removes directories it created when the commit fails', async () => {
    await project({ 'a.cerial': 'x' });
    const { plan, contents } = setup(['a.cerial'], { outDir: join(root, 'out/deep') });

    await refusal(
      writeOutputs(plan, {
        contents,
        rename: () => Promise.reject(new Error('boom')),
      }),
    );

    await expect(stat(join(root, 'out'))).rejects.toThrow();
  });
});
