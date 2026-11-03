/**
 * The watcher against TypeScript schema entries. Needs no database.
 *
 * Regeneration runs in a child process of the real CLI, so these tests drive the real function and read
 * the generated files rather than asserting that a regeneration happened.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { toClientClassName } from '../../src/cli/config';
import { formatSchema } from '../../src/cli/format';
import {
  type CliInvocation,
  buildGenerateArgs,
  createCoalescedRunner,
  isCerialFile,
  runGenerateChild,
  shouldTriggerRegeneration,
  startWatcher,
  type WatchTarget,
} from '../../src/cli/watcher';

const ROOT = resolve(import.meta.dir, '../.tmp-watcher-typescript');
const CLI: CliInvocation = {
  execPath: process.execPath,
  args: ['run'],
  entry: resolve(import.meta.dir, '../../bin/cerial.ts'),
};

const POST = (extra = '') => `import { f, model } from '../../../../src/schema';

export const shared = { title: f.string(),${extra} };

export const Post = model('Post', {
  id: f.record().id(),
  ...shared,
});
`;

const USER = `import { f, model } from '../../../../src/schema';

export const User = model('User', {
  id: f.record().id(),
  name: f.string(),
});
`;

let project: string;
let counter = 0;

async function makeProject(files: Record<string, string>): Promise<{ schemaPath: string; outputDir: string }> {
  project = join(ROOT, `p${counter++}`);
  const schemaPath = join(project, 'schema');
  await mkdir(schemaPath, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    await mkdir(join(schemaPath, name, '..'), { recursive: true });
    await writeFile(join(schemaPath, name), text);
  }

  return { schemaPath, outputDir: join(schemaPath, 'client') };
}

async function generatedText(outputDir: string): Promise<string> {
  const files = (await readdir(outputDir, { recursive: true })).filter((f) => f.endsWith('.ts'));

  return (await Promise.all(files.map((f) => readFile(join(outputDir, f), 'utf8')))).join('\n');
}

/** The generated text of the Draft model alone, which spreads fields exported by the module that is edited */
async function draftText(outputDir: string): Promise<string> {
  const files = (await readdir(outputDir, { recursive: true })).filter((f) => /draft/i.test(f) && f.endsWith('.ts'));

  return (await Promise.all(files.map((f) => readFile(join(outputDir, f), 'utf8')))).join('\n');
}

/** Records what a console method received; `count(text)` resolves once that many lines contained `text` */
function logWaiter(spy: ReturnType<typeof spyOn>) {
  const lines: string[] = [];
  const waiters: Array<() => void> = [];
  spy.mockImplementation((...args: unknown[]) => {
    lines.push(String(args[0]));
    for (const w of [...waiters]) w();
  });

  return (text: string, count = 1): Promise<void> =>
    new Promise((done) => {
      const check = (): void => {
        if (lines.filter((l) => l.includes(text)).length < count) return;
        waiters.splice(waiters.indexOf(check), 1);
        done();
      };
      waiters.push(check);
      check();
    });
}

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

describe('which files trigger regeneration', () => {
  const scope = { schemaPath: '/p/schema', outputDir: '/p/schema/client' };

  it('a plain .ts file triggers in an entry holding TypeScript modules', () => {
    expect(shouldTriggerRegeneration('shared/helpers.ts', undefined, scope)).toBe(true);
    expect(shouldTriggerRegeneration('user.schema.ts', undefined, scope)).toBe(true);
  });

  it('a plain .ts file does not trigger without the scope, so .cerial-only entries are unchanged', () => {
    expect(shouldTriggerRegeneration('shared/helpers.ts')).toBe(false);
    expect(shouldTriggerRegeneration('models/user.cerial')).toBe(true);
    expect(shouldTriggerRegeneration('.cerialignore')).toBe(true);
    expect(shouldTriggerRegeneration('notes.md', undefined, scope)).toBe(false);
  });

  it('generated output never triggers', () => {
    expect(shouldTriggerRegeneration('client/index.ts', undefined, scope)).toBe(false);
    expect(shouldTriggerRegeneration('client/models/user.d.ts', undefined, scope)).toBe(false);
    expect(shouldTriggerRegeneration('cerial/handles.ts', undefined, scope)).toBe(false);
    expect(shouldTriggerRegeneration('nested/cerial/handles.ts', undefined, scope)).toBe(false);
  });

  it('a sibling that merely starts with the output name still triggers', () => {
    expect(shouldTriggerRegeneration('client-helpers.ts', undefined, scope)).toBe(true);
  });

  it('an output outside the schema directory excludes nothing', () => {
    const outside = { schemaPath: '/p/schema', outputDir: '/p/out' };

    expect(shouldTriggerRegeneration('client/index.ts', undefined, outside)).toBe(true);
  });

  it('the filter still applies to plain .ts files', () => {
    const filter = { shouldInclude: (p: string) => !p.startsWith('skip/') };

    expect(shouldTriggerRegeneration('skip/helpers.ts', filter, scope)).toBe(false);
    expect(shouldTriggerRegeneration('keep/helpers.ts', filter, scope)).toBe(true);
  });
});

describe('the formatter and the watcher agree on ownership', () => {
  it('.ts triggers regeneration and is never a format target', () => {
    const scope = { schemaPath: '/p/schema', outputDir: '/p/schema/client' };
    for (const name of ['user.schema.ts', 'shared/helpers.ts']) {
      expect(shouldTriggerRegeneration(name, undefined, scope)).toBe(true);
      expect(isCerialFile(name)).toBe(false);
    }
  });

  it('.cerial is both regenerated and formatted', () => {
    expect(shouldTriggerRegeneration('user.cerial')).toBe(true);
    expect(isCerialFile('user.cerial')).toBe(true);
  });

  it('cerial format leaves a TypeScript schema module untouched and reports no error', async () => {
    const { schemaPath } = await makeProject({ 'user.schema.ts': USER });
    const summary = await formatSchema({ schemaPath });

    expect(summary.total).toBe(0);
    expect(summary.errors).toEqual([]);
    expect(await readFile(join(schemaPath, 'user.schema.ts'), 'utf8')).toBe(USER);
  });
});

describe('coalesced regeneration', () => {
  it('runs once for one call', async () => {
    let runs = 0;
    await createCoalescedRunner(async () => void runs++)();

    expect(runs).toBe(1);
  });

  it('never overlaps, and changes during a run cost exactly one rerun', async () => {
    let runs = 0;
    let active = 0;
    let maxActive = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const run = createCoalescedRunner(async () => {
      runs++;
      active++;
      maxActive = Math.max(maxActive, active);
      if (runs === 1) await gate;
      active--;
    });

    const first = run();
    await run();
    await run();
    await run();
    release();
    await first;

    expect(runs).toBe(2);
    expect(maxActive).toBe(1);
  });

  it('a failing run does not block the next', async () => {
    let runs = 0;
    const run = createCoalescedRunner(async () => {
      runs++;
      if (runs === 1) throw new Error('boom');
    });

    await expect(run()).rejects.toThrow('boom');
    await run();

    expect(runs).toBe(2);
  });
});

describe('child process regeneration', () => {
  beforeEach(async () => {
    await mkdir(ROOT, { recursive: true });
  });

  it('succeeds and writes the client', async () => {
    const target = await makeProject({ 'user.schema.ts': USER });
    const failure = await runGenerateChild({ ...target }, CLI);

    expect(failure).toBeNull();
    expect(await generatedText(target.outputDir)).toContain('User');
  });

  it('reports a non-zero exit instead of throwing', async () => {
    const target = await makeProject({ 'user.schema.ts': 'export const x = ;\n' });
    const failure = await runGenerateChild({ ...target }, CLI);

    expect(failure).toMatch(/exited with code [1-9]/);
  });

  it('reports a process that cannot start', async () => {
    const target = await makeProject({ 'user.schema.ts': USER });
    const failure = await runGenerateChild({ ...target }, { execPath: join(ROOT, 'missing-binary'), entry: 'x' });

    expect(failure).toContain('could not start');
  });
});

describe('which entry a child regenerates', () => {
  const target: WatchTarget = { schemaPath: '/p/schema', outputDir: '/p/out' };

  it('a target with no config keeps the -s and -o args', () => {
    const args = buildGenerateArgs(target, CLI);

    expect(args.slice(args.indexOf('generate'))).toEqual([
      'generate',
      '-s',
      '/p/schema',
      '-o',
      '/p/out',
      '--log',
      'minimal',
    ]);
  });

  it('a marker-root target, named but with no class name, keeps -s', () => {
    const args = buildGenerateArgs({ ...target, name: 'schema' }, CLI);

    expect(args).toContain('-s');
    expect(args).not.toContain('-n');
  });

  it('a config entry is selected by name, with -C only when a config path was passed', () => {
    const entry: WatchTarget = { ...target, name: 'blog', clientClassName: 'BlogCerialClient' };

    expect(buildGenerateArgs(entry, CLI)).not.toContain('-C');
    expect(buildGenerateArgs(entry, CLI)).not.toContain('-s');
    const withConfig = buildGenerateArgs({ ...entry, configPath: 'cerial.config.json' }, CLI);
    expect(withConfig.slice(withConfig.indexOf('-n'), withConfig.indexOf('-n') + 4)).toEqual([
      '-n',
      'blog',
      '-C',
      'cerial.config.json',
    ]);
  });

  it('a config entry regenerates with its own client class name through the real child', async () => {
    await mkdir(ROOT, { recursive: true });
    const { schemaPath, outputDir } = await makeProject({ 'user.schema.ts': USER });
    const configPath = join(project, 'cerial.config.json');
    await writeFile(configPath, JSON.stringify({ schemas: { blog: { path: schemaPath, output: outputDir } } }));
    const className = toClientClassName('blog');

    const failure = await runGenerateChild(
      { name: 'blog', schemaPath, outputDir, clientClassName: className, configPath },
      CLI,
    );

    expect(failure).toBeNull();
    expect(await generatedText(outputDir)).toContain(className);
  });

  it('the same project through -s falls back to the default class name', async () => {
    await mkdir(ROOT, { recursive: true });
    const { schemaPath, outputDir } = await makeProject({ 'user.schema.ts': USER });

    expect(await runGenerateChild({ schemaPath, outputDir }, CLI)).toBeNull();
    expect(await generatedText(outputDir)).not.toContain(toClientClassName('blog'));
  });
});

describe('watching a TypeScript entry', () => {
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    await mkdir(ROOT, { recursive: true });
    logSpy = spyOn(console, 'log');
    errorSpy = spyOn(console, 'error');
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  async function stop(done: Promise<void>): Promise<void> {
    process.emit('SIGINT');
    await done;
  }

  it('reflects an edit to an imported module, twice, with no duplicate-name refusal', async () => {
    const { schemaPath, outputDir } = await makeProject({ 'user.schema.ts': USER, 'post.schema.ts': POST() });
    // `user` imports `post`; the edited module is the imported one
    await writeFile(
      join(schemaPath, 'user.schema.ts'),
      `import { f, model } from '../../../../src/schema';
import { shared } from './post.schema';

// Draft is built from a plain value exported by the edited module, so it shows the imported module's
// current contents or the runtime's cached copy of them
export const Draft = model('Draft', { id: f.record().id(), ...shared });

export const User = model('User', {
  id: f.record().id(),
  name: f.string(),
});
`,
    );
    expect(await runGenerateChild({ schemaPath, outputDir }, CLI)).toBeNull();
    expect(await generatedText(outputDir)).not.toContain('subtitle');

    const logged = logWaiter(logSpy);
    const target: WatchTarget = { name: 'blog', schemaPath, outputDir };
    const done = startWatcher([target], { cli: CLI });
    await logged('Watching 1 schema');

    await writeFile(join(schemaPath, 'post.schema.ts'), POST('\n  subtitle: f.string().optional(),'));
    await logged('regenerated in');
    expect(await generatedText(outputDir)).toContain('subtitle');
    expect(await draftText(outputDir)).toContain('subtitle');

    await writeFile(
      join(schemaPath, 'post.schema.ts'),
      POST('\n  subtitle: f.string().optional(),\n  slug: f.string().optional(),'),
    );
    await logged('regenerated in', 2);
    const text = await generatedText(outputDir);
    expect(text).toContain('slug');
    expect(text).toContain('subtitle');
    expect(await draftText(outputDir)).toContain('slug');

    await stop(done);
    expect(errorSpy).not.toHaveBeenCalled();
  }, 60_000);

  it('regenerates when a plain .ts file a module imports changes', async () => {
    const { schemaPath, outputDir } = await makeProject({
      'shared/fields.ts': "export const label = 'first';\n",
      'user.schema.ts': `import { f, model } from '../../../../src/schema';
import { label } from './shared/fields';

export const User = model('User', {
  id: f.record().id(),
  [label]: f.string(),
});
`,
    });
    expect(await runGenerateChild({ schemaPath, outputDir }, CLI)).toBeNull();

    const logged = logWaiter(logSpy);
    const done = startWatcher([{ schemaPath, outputDir }], { cli: CLI });
    await logged('Watching 1 schema');
    await writeFile(join(schemaPath, 'shared/fields.ts'), "export const label = 'second';\n");
    await logged('regenerated in');

    expect(await generatedText(outputDir)).toContain('second');
    await stop(done);
  }, 60_000);

  it('survives a crashed child and regenerates on the next change', async () => {
    const { schemaPath, outputDir } = await makeProject({ 'user.schema.ts': USER });
    const crash = join(project, 'crash.ts');
    await writeFile(crash, 'process.exit(3);\n');
    const logged = logWaiter(logSpy);
    const errored = logWaiter(errorSpy);
    const done = startWatcher([{ schemaPath, outputDir }], {
      cli: { execPath: process.execPath, args: ['run'], entry: crash },
    });
    await logged('Watching 1 schema');

    await writeFile(join(schemaPath, 'user.schema.ts'), `${USER}// one\n`);
    await errored('exited with code 3');
    await writeFile(join(schemaPath, 'user.schema.ts'), `${USER}// two\n`);
    await errored('exited with code 3', 2);

    await stop(done);
  }, 60_000);
});

describe('watching the imports of an entry outside its folder', () => {
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    await mkdir(ROOT, { recursive: true });
    logSpy = spyOn(console, 'log');
    errorSpy = spyOn(console, 'error');
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  const SURFACE = '../../../../src/schema';
  const moduleText = (name: string, field = 'name') =>
    `import { f, model } from '${SURFACE}';\n\nexport const ${name} = model('${name}', {\n  id: f.record().id(),\n  ${field}: f.string(),\n});\n`;
  const entryText = (names: string[]) =>
    `import { defineSchema } from '${SURFACE}';\n${names.map((n) => `import { ${n} } from '../shared/${n.toLowerCase()}';`).join('\n')}\n\nexport default defineSchema({ models: [${names.join(', ')}] });\n`;

  /** A project whose entry lives in schema/ and imports modules from the sibling folder shared/ */
  async function outsideProject(names: string[]) {
    const target = await makeProject({ 'entry.schema.ts': entryText(names) });
    await mkdir(join(project, 'shared'), { recursive: true });
    for (const name of names) await writeFile(join(project, 'shared', `${name.toLowerCase()}.ts`), moduleText(name));
    const entry = join(target.schemaPath, 'entry.schema.ts');
    expect(await runGenerateChild(target, CLI)).toBeNull();

    return { ...target, entry, shared: join(project, 'shared') };
  }

  const detected = (): number =>
    logSpy.mock.calls.filter((call: unknown[]) => String(call[0]).includes('Change detected')).length;
  const quiet = (): Promise<void> => new Promise((done) => setTimeout(done, 1_200));

  /** Rewrites `file` until `ready()` holds, for a watch that opens after a regeneration with no event to wait on */
  async function rewriteUntil(file: string, text: (n: number) => string, ready: () => Promise<boolean>): Promise<void> {
    for (let n = 0; n < 40; n++) {
      await writeFile(file, text(n));
      await new Promise((done) => setTimeout(done, 750));
      if (await ready()) return;
    }
    throw new Error(`no regeneration after rewriting ${file}`);
  }

  async function stop(done: Promise<void>): Promise<void> {
    process.emit('SIGINT');
    await done;
  }

  it('a change to a module outside the entry folder regenerates; a sibling not in the graph does not', async () => {
    const { schemaPath, outputDir, entry, shared } = await outsideProject(['User']);
    await writeFile(join(shared, 'unrelated.ts'), 'export const x = 1;\n');
    const logged = logWaiter(logSpy);
    const done = startWatcher([{ schemaPath, outputDir, entry, entryOnly: true }], { cli: CLI });
    await logged('Watching 1 schema');

    await writeFile(join(shared, 'unrelated.ts'), 'export const x = 2;\n');
    await quiet();
    expect(detected()).toBe(0);

    await writeFile(join(shared, 'user.ts'), moduleText('User', 'nickname'));
    await logged('regenerated in');
    expect(await generatedText(outputDir)).toContain('nickname');
    expect(detected()).toBe(1);

    await stop(done);
  }, 60_000);

  it('output, handles.ts and node_modules never trigger', async () => {
    const { schemaPath, outputDir, entry, shared } = await outsideProject(['User']);
    const logged = logWaiter(logSpy);
    const done = startWatcher([{ schemaPath, outputDir, entry, entryOnly: true }], { cli: CLI });
    await logged('Watching 1 schema');

    for (const dir of [schemaPath, shared]) {
      await mkdir(join(dir, 'cerial'), { recursive: true });
      await mkdir(join(dir, 'node_modules/pkg'), { recursive: true });
      await writeFile(join(dir, 'cerial/handles.ts'), 'export {};\n');
      await writeFile(join(dir, 'node_modules/pkg/index.ts'), 'export {};\n');
    }
    await writeFile(join(outputDir, 'touched.ts'), 'export {};\n');
    await quiet();

    expect(detected()).toBe(0);
    await stop(done);
  }, 60_000);

  it('a module newly imported after a regeneration is then watched', async () => {
    const { schemaPath, outputDir, entry, shared } = await outsideProject(['User']);
    await writeFile(join(shared, 'post.ts'), moduleText('Post'));
    const logged = logWaiter(logSpy);
    const done = startWatcher([{ schemaPath, outputDir, entry, entryOnly: true }], { cli: CLI });
    await logged('Watching 1 schema');

    await writeFile(entry, entryText(['User', 'Post']));
    await logged('regenerated in');
    await rewriteUntil(
      join(shared, 'post.ts'),
      (n) => moduleText('Post', `title${n}`),
      async () => (await generatedText(outputDir)).includes('title'),
    );

    await stop(done);
  }, 120_000);

  it('a module removed from the graph stops triggering', async () => {
    const { schemaPath, outputDir, entry, shared } = await outsideProject(['User', 'Post']);
    const logged = logWaiter(logSpy);
    const done = startWatcher([{ schemaPath, outputDir, entry, entryOnly: true }], { cli: CLI });
    await logged('Watching 1 schema');

    await writeFile(entry, entryText(['User']));
    await logged('regenerated in');
    await quiet();
    const before = detected();

    await writeFile(join(shared, 'post.ts'), moduleText('Post', 'ignored'));
    await quiet();
    expect(detected()).toBe(before);

    await writeFile(join(shared, 'user.ts'), moduleText('User', 'stillwatched'));
    await logged('regenerated in', 2);
    expect(await generatedText(outputDir)).toContain('stillwatched');
    await stop(done);
  }, 120_000);

  it('an entry outside path triggers', async () => {
    const target = await makeProject({ 'README.md': 'no schema here\n' });
    const elsewhere = join(project, 'elsewhere');
    await mkdir(elsewhere, { recursive: true });
    const entry = join(elsewhere, 'entry.ts');
    await writeFile(join(elsewhere, 'user.ts'), moduleText('User'));
    await writeFile(
      entry,
      `import { defineSchema } from '${SURFACE}';\nimport { User } from './user';\n\nexport default defineSchema({ models: [User] });\n`,
    );
    const configPath = join(project, 'cerial.config.json');
    await writeFile(
      configPath,
      JSON.stringify({ schemas: { blog: { path: target.schemaPath, entry, output: target.outputDir } } }),
    );
    const watchTarget: WatchTarget = {
      name: 'blog',
      clientClassName: toClientClassName('blog'),
      ...target,
      configPath,
      entry,
    };
    expect(await runGenerateChild(watchTarget, CLI)).toBeNull();
    const logged = logWaiter(logSpy);
    const done = startWatcher([watchTarget], { cli: CLI });
    await logged('Watching 1 schema');

    await writeFile(join(elsewhere, 'user.ts'), moduleText('User', 'viaentry'));
    await logged('regenerated in');
    expect(await generatedText(target.outputDir)).toContain('viaentry');

    await stop(done);
  }, 60_000);

  it('a listed file outside the folder triggers', async () => {
    const target = await makeProject({ 'README.md': 'no schema here\n' });
    const listedDir = join(project, 'listed');
    await mkdir(listedDir, { recursive: true });
    const file = join(listedDir, 'user.schema.ts');
    await writeFile(file, moduleText('User'));
    const configPath = join(project, 'cerial.config.json');
    await writeFile(configPath, JSON.stringify({ schemas: { blog: { files: [file], output: target.outputDir } } }));
    const watchTarget: WatchTarget = {
      name: 'blog',
      clientClassName: toClientClassName('blog'),
      ...target,
      configPath,
      files: [file],
      entryOnly: true,
    };
    expect(await runGenerateChild(watchTarget, CLI)).toBeNull();
    const logged = logWaiter(logSpy);
    const done = startWatcher([watchTarget], { cli: CLI });
    await logged('Watching 1 schema');

    await writeFile(join(listedDir, 'other.ts'), 'export {};\n');
    await quiet();
    expect(detected()).toBe(0);

    await writeFile(file, moduleText('User', 'listedfield'));
    await logged('regenerated in');
    expect(await generatedText(target.outputDir)).toContain('listedfield');

    await stop(done);
  }, 60_000);

  it('a broken module during the recompute keeps the watcher alive', async () => {
    const { schemaPath, outputDir, entry, shared } = await outsideProject(['User']);
    const logged = logWaiter(logSpy);
    const done = startWatcher([{ schemaPath, outputDir, entry, entryOnly: true }], { cli: CLI });
    await logged('Watching 1 schema');

    await writeFile(join(shared, 'user.ts'), 'export const User = ;\n');
    await logged('Change detected');
    await quiet();
    await writeFile(join(shared, 'user.ts'), moduleText('User', 'recovered'));
    await rewriteUntil(
      join(shared, 'user.ts'),
      () => moduleText('User', 'recovered'),
      async () => (await generatedText(outputDir)).includes('recovered'),
    );

    await stop(done);
  }, 120_000);
});
