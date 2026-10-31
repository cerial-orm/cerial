import { afterAll, afterEach, describe, expect, it, spyOn } from 'bun:test';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { formatSchema, listedCerialFiles } from '../../../src/cli/format';
import { startFormatterWatcher, startWatcher } from '../../../src/cli/watcher';
import { resolveConfig } from '../../../src/formatter/rules';
import { removeTempProjects, tempProject } from '../../registration-project';

const CLI = resolve(import.meta.dir, '../../../bin/cerial.ts');
const MESSY = 'model   User{\nid Record   @id\n  name   String\n}\n';
const TS = `import { model } from 'cerial';\nexport const   User  =   model('User',{});\n`;

afterAll(removeTempProjects);
afterEach(() => {
  process.emit('SIGINT');
});

const read = (dir: string, name: string): string => readFileSync(join(dir, name), 'utf-8');

async function run(cwd: string, ...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(['bun', 'run', CLI, ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { code, stdout, stderr };
}

const config = (schemas: Record<string, unknown>): string => JSON.stringify({ schemas });

/** Resolves once `read()` differs from `before`, or after `ms` */
async function changed(read: () => string, before: string, ms = 5000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (read() !== before) return true;
    await Bun.sleep(50);
  }

  return false;
}

describe('listedCerialFiles', () => {
  it('keeps listed .cerial files and drops .ts modules', () => {
    const files = ['/p/a.cerial', '/p/b.ts', '/q/c.cerial'];

    expect(listedCerialFiles({ schemaPath: '/p', files })).toEqual(['/p/a.cerial', '/q/c.cerial']);
  });

  it('drops a file the filter cascade excludes', () => {
    const filter = { shouldInclude: (path: string) => !path.startsWith('skip/') };
    const files = ['/p/skip/a.cerial', '/p/keep/b.cerial'];

    expect(listedCerialFiles({ schemaPath: '/p', files, filter })).toEqual(['/p/keep/b.cerial']);
  });

  it('is empty with nothing listed', () => {
    expect(listedCerialFiles({ schemaPath: '/p' })).toEqual([]);
  });
});

describe('formatSchema with listed files', () => {
  it('formats a listed file outside the directory as well as the directory', async () => {
    const dir = await tempProject({ 'in/a.cerial': MESSY, 'out/b.cerial': MESSY });
    const summary = await formatSchema({ schemaPath: join(dir, 'in'), files: [join(dir, 'out/b.cerial')] });

    expect(summary.formatted).toBe(2);
    expect(read(dir, 'in/a.cerial')).not.toBe(MESSY);
    expect(read(dir, 'out/b.cerial')).not.toBe(MESSY);
  });

  it('counts a listed file inside the directory once', async () => {
    const dir = await tempProject({ 'in/a.cerial': MESSY });
    const summary = await formatSchema({ schemaPath: join(dir, 'in'), files: [join(dir, 'in/a.cerial')] });

    expect(summary.total).toBe(1);
  });

  it('leaves the folder alone when directory is false', async () => {
    const dir = await tempProject({ 'in/a.cerial': MESSY, 'in/b.cerial': MESSY });
    await formatSchema({ schemaPath: join(dir, 'in'), files: [join(dir, 'in/a.cerial')], directory: false });

    expect(read(dir, 'in/a.cerial')).not.toBe(MESSY);
    expect(read(dir, 'in/b.cerial')).toBe(MESSY);
  });
});

describe('cerial format with a files-only schema', () => {
  it('formats listed .cerial files and leaves listed .ts modules and the folder untouched', async () => {
    const dir = await tempProject({
      'cerial.config.json': config({ app: { files: ['src/a.cerial', 'src/m.ts'], output: './client' } }),
      'src/a.cerial': MESSY,
      'src/m.ts': TS,
      'src/unlisted.cerial': MESSY,
      'src/other.ts': TS,
    });
    const { code, stdout } = await run(dir, 'format');

    expect(code).toBe(0);
    expect(stdout).toContain('formatted 1');
    expect(read(dir, 'src/a.cerial')).not.toBe(MESSY);
    expect(read(dir, 'src/m.ts')).toBe(TS);
    expect(read(dir, 'src/other.ts')).toBe(TS);
    expect(read(dir, 'src/unlisted.cerial')).toBe(MESSY);
  });

  it('formats a listed file outside the path of a schema that has one', async () => {
    const dir = await tempProject({
      'cerial.config.json': config({ app: { path: './schemas', files: ['extra/b.cerial'], output: './client' } }),
      'schemas/a.cerial': MESSY,
      'extra/b.cerial': MESSY,
    });
    const { code } = await run(dir, 'format');

    expect(code).toBe(0);
    expect(read(dir, 'schemas/a.cerial')).not.toBe(MESSY);
    expect(read(dir, 'extra/b.cerial')).not.toBe(MESSY);
  });

  it('does not format a listed file the exclude pattern removes', async () => {
    const dir = await tempProject({
      'cerial.config.json': config({
        app: { files: ['src/a.cerial', 'src/skip/b.cerial'], exclude: ['skip/**'], output: './client' },
      }),
      'src/a.cerial': MESSY,
      'src/skip/b.cerial': MESSY,
    });
    const { code } = await run(dir, 'format');

    expect(code).toBe(0);
    expect(read(dir, 'src/a.cerial')).not.toBe(MESSY);
    expect(read(dir, 'src/skip/b.cerial')).toBe(MESSY);
  });

  it('formats nothing and does not fail for an entry-only schema when another schema has work', async () => {
    const dir = await tempProject({
      'cerial.config.json': config({
        app: { entry: './app/schema.ts', output: './client-app' },
        legacy: { path: './legacy', output: './client-legacy' },
      }),
      'app/schema.ts': TS,
      'app/stray.cerial': MESSY,
      'legacy/a.cerial': MESSY,
    });
    const { code, stderr } = await run(dir, 'format');

    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(read(dir, 'legacy/a.cerial')).not.toBe(MESSY);
    expect(read(dir, 'app/schema.ts')).toBe(TS);
    expect(read(dir, 'app/stray.cerial')).toBe(MESSY);
  });

  it('keeps the existing message when an entry-only schema is all there is', async () => {
    const dir = await tempProject({
      'cerial.config.json': config({ app: { entry: './app/schema.ts', output: './client' } }),
      'app/schema.ts': TS,
    });
    const { code, stderr } = await run(dir, 'format');

    expect(code).toBe(1);
    expect(stderr).toContain('No schema paths found');
    expect(read(dir, 'app/schema.ts')).toBe(TS);
  });
});

describe('cerial generate --format with a files-only schema', () => {
  it('formats the listed .cerial files before generating and leaves the rest alone', async () => {
    const dir = await tempProject({
      'cerial.config.json': config({ app: { files: ['src/a.cerial'], output: './client' } }),
      'src/a.cerial': MESSY,
      'src/unlisted.cerial': MESSY,
    });
    await run(dir, 'generate', '--format', '--log', 'minimal');

    expect(read(dir, 'src/a.cerial')).not.toBe(MESSY);
    expect(read(dir, 'src/unlisted.cerial')).toBe(MESSY);
  });
});

describe('the watcher format step with a files-only schema', () => {
  it('formats a changed listed .cerial file and never an unlisted one in the folder', async () => {
    const dir = await tempProject({ 'src/a.cerial': 'model A{\nid Record @id\n}\n', 'src/unlisted.cerial': 'x\n' });
    const log = spyOn(console, 'log').mockImplementation(() => {});
    const error = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const target = {
        schemaPath: join(dir, 'src'),
        outputDir: join(dir, 'client'),
        files: [join(dir, 'src/a.cerial')],
        entryOnly: true,
      };
      void startWatcher([target], { format: true });
      await Bun.sleep(300);
      await writeFile(join(dir, 'src/unlisted.cerial'), MESSY);
      await writeFile(join(dir, 'src/a.cerial'), MESSY);

      expect(await changed(() => read(dir, 'src/a.cerial'), MESSY)).toBe(true);
      expect(read(dir, 'src/unlisted.cerial')).toBe(MESSY);
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });

  it('the format-only watcher formats a listed file outside the folder', async () => {
    const dir = await tempProject({ 'src/a.cerial': 'model A{\nid Record @id\n}\n', 'out/b.cerial': 'x\n' });
    const log = spyOn(console, 'log').mockImplementation(() => {});
    try {
      void startFormatterWatcher(
        [{ schemaPath: join(dir, 'src'), files: [join(dir, 'out/b.cerial')] }],
        resolveConfig(),
      );
      await Bun.sleep(500);
      await writeFile(join(dir, 'out/b.cerial'), MESSY);

      expect(await changed(() => read(dir, 'out/b.cerial'), MESSY)).toBe(true);
    } finally {
      log.mockRestore();
    }
  });
});
