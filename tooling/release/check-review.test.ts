// The review gate against a scratch repository: one valid document, and one test per way it must refuse.

import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { newScratch, removeScratchesAfterAll, seed, write } from '../hooks/test-support.ts';
import type { Scratch } from '../hooks/scratch.ts';
import { checkReview, sampleSites } from './check-review.ts';
import { PASSES, parseReview, splitCells } from './review-doc.ts';

removeScratchesAfterAll();

const CHECK = join(import.meta.dir, 'check-review.ts');
const SELECT_KEY = 'src/a.ts::select::template::escapeIdent(f)';
const DROP_KEY = 'src/a.ts::drop::template::t';
const A_TS = [
  'const escapeIdent = (v: string): string => v;',
  `export const select = (f: string): string => \`SELECT \${escapeIdent(f)} FROM t\`;`,
  '',
].join('\n');
const DROP_TS = `export const drop = (t: string): string => \`REMOVE TABLE \${t}\`;\n`;
const NOTES = 'apps/docs/content/docs/releases/orm/0/3.mdx';

type Rows = string[][];

interface Model {
  front: Record<string, string>;
  commits: Rows;
  sites: Rows;
  passes: Rows;
  findings: Rows;
  refires: Rows;
}

interface Fixture {
  scratch: Scratch;
  c0: string;
  c1: string;
  c2: string;
  review: string;
  model: Model;
}

const table = (headers: string[], rows: Rows): string =>
  [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => cell.replace(/\|/g, '\\|')).join(' | ')} |`),
  ].join('\n');

function render(model: Model): string {
  const front = Object.entries(model.front)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');

  return [
    `---\n${front}\n---`,
    `## Commits\n\n${table(['sha', 'subject', 'passes'], model.commits)}`,
    `## Sites\n\n${table(['key', 'class', 'reason'], model.sites)}`,
    `## Passes\n\n${table(['pass', 'statement'], model.passes)}`,
    `## Findings\n\n${table(['id', 'pass', 'status', 'payload', 'output', 'fix', 'test', 'accepted', 'reviewer'], model.findings)}`,
    `## Re-fires\n\n${table(['key', 'payload', 'output'], model.refires)}`,
    '',
  ].join('\n\n');
}

const head = (scratch: Scratch): string => scratch.git('rev-parse', 'HEAD').stdout.trim();

function fixture(): Fixture {
  const scratch = newScratch();
  seed(scratch, {
    'apps/orm/package.json': '{ "name": "cerial", "version": "0.3.0" }\n',
    'apps/orm/src/a.ts': A_TS,
    'apps/vscode-extension/src/x.ts': 'export const x = 1;\n',
  });
  const c0 = head(scratch);
  scratch.git('tag', 'orm-v0.2.0');
  scratch.git('tag', 'ext-v0.1.0');
  seed(scratch, { 'apps/orm/src/a.ts': A_TS + DROP_TS });
  const c1 = head(scratch);
  seed(scratch, { 'apps/vscode-extension/src/x.ts': 'export const x = 2;\n' });
  const c2 = head(scratch);

  write(
    scratch,
    NOTES,
    '## 0.3.0\n\n### Security\n\nThe limit in o-1 stays, by the maintainer.\n\n### Fixed\n\nNothing.\n',
  );
  for (const file of ['f1.txt', 'f2.txt', 'refire.txt']) write(scratch, `audit/out/${file}`, 'captured\n');
  const model: Model = {
    front: {
      base: 'orm-v0.2.0',
      ext_base: 'ext-v0.1.0',
      reviewed_head: c2,
      scope: 'apps/orm/src, apps/orm/package.json, apps/vscode-extension',
    },
    commits: [
      [c1, 'feat: drop', 'identifiers, validation'],
      [c2, 'feat: ext', 'scope'],
    ],
    sites: [
      [SELECT_KEY, 'validated', 'the name goes through `escapeIdent`'],
      [DROP_KEY, 'constant', 'only called with a literal'],
    ],
    passes: PASSES.map((pass) => [pass, `${pass} was read`]),
    findings: [
      ['f-1', 'identifiers', 'fixed', 'a" ; REMOVE TABLE x', 'out/f1.txt', c1, 'apps/orm/src/a.ts', '', 'fable'],
      ['f-2', 'validation', 'refuted', 'payload', 'out/f2.txt', '', '', '', 'opus'],
      ['o-1', 'writes', 'accepted', '', '', '', '', 'maintainer 2026-11-06 "ship it with this limit"', 'opus'],
    ],
    refires: [[SELECT_KEY, 'payload', 'out/refire.txt']],
  };

  return { scratch, c0, c1, c2, review: join(scratch.dir, 'audit', 'review.md'), model };
}

function run(fx: Fixture, through?: (typeof PASSES)[number], final = false): string[] {
  mkdirSync(dirname(fx.review), { recursive: true });
  writeFileSync(fx.review, render(fx.model));

  return checkReview({ repo: fx.scratch.dir, review: fx.review, through, final }).violations;
}

const has = (lines: string[], text: string): boolean => lines.some((line) => line.includes(text));

describe('a valid document', () => {
  test('passes, in full and in final mode', () => {
    const fx = fixture();
    expect(run(fx)).toEqual([]);
    expect(run(fx, undefined, true)).toEqual([]);
  });

  test('compares tags by version, not by name', () => {
    const fx = fixture();
    fx.scratch.git('tag', 'orm-v0.9.0', fx.c0);
    fx.scratch.git('tag', 'orm-v0.10.0', fx.c0);
    fx.model.front.base = 'orm-v0.10.0';
    expect(run(fx)).toEqual([]);
    fx.model.front.base = 'orm-v0.9.0';
    expect(has(run(fx), 'is not the highest orm-v* tag')).toBe(true);
  });
});

describe('the frame', () => {
  test('refuses a base that is not the highest orm tag', () => {
    const fx = fixture();
    fx.scratch.git('tag', 'orm-v0.3.0', fx.c0);
    expect(has(run(fx), 'base orm-v0.2.0 is not the highest orm-v* tag')).toBe(true);
  });

  test('refuses an ext_base that is not the highest ext tag', () => {
    const fx = fixture();
    fx.scratch.git('tag', 'ext-v0.2.0', fx.c0);
    expect(has(run(fx), 'ext_base ext-v0.1.0 is not the highest ext-v* tag')).toBe(true);
  });

  test('refuses a reviewed_head that is not an ancestor of HEAD', () => {
    const fx = fixture();
    fx.scratch.git('checkout', '-q', '-b', 'side', fx.c0);
    seed(fx.scratch, { 'apps/orm/src/side.ts': 'export const side = 1;\n' });
    const side = head(fx.scratch);
    fx.scratch.git('checkout', '-q', '-');
    fx.model.front.reviewed_head = side;
    expect(has(run(fx), 'is not an ancestor of HEAD')).toBe(true);
  });

  test('refuses a scope file that differs between reviewed_head and HEAD', () => {
    const fx = fixture();
    seed(fx.scratch, { 'apps/orm/package.json': '{ "name": "cerial", "version": "0.3.1" }\n' });
    expect(run(fx)).toContain('apps/orm/package.json changed after reviewed_head');
  });

  test('ignores a change outside the scope', () => {
    const fx = fixture();
    seed(fx.scratch, { 'README.md': 'changed\n' });
    expect(run(fx)).toEqual([]);
  });

  test('refuses a document with no scope', () => {
    const fx = fixture();
    fx.model.front.scope = '';
    expect(run(fx)).toContain('frontmatter has no scope');
  });
});

describe('commits', () => {
  test('refuses a commit in the range with no row', () => {
    const fx = fixture();
    fx.model.commits = fx.model.commits.slice(1);
    expect(run(fx)).toContain(`commit ${fx.c1.slice(0, 8)} is in the range and has no row`);
  });

  test('refuses an extension commit with no row, measured from ext_base', () => {
    const fx = fixture();
    fx.model.commits = fx.model.commits.slice(0, 1);
    expect(run(fx)).toContain(`commit ${fx.c2.slice(0, 8)} is in the range and has no row`);
  });

  test('refuses a row with no pass, and a row naming an unknown pass', () => {
    const fx = fixture();
    fx.model.commits[0]![2] = '';
    fx.model.commits[1]![2] = 'vibes';
    const lines = run(fx);
    expect(lines).toContain(`commit ${fx.c1.slice(0, 8)} has no pass`);
    expect(lines).toContain(`commit ${fx.c2.slice(0, 8)} names unknown pass vibes`);
  });

  test('accepts an abbreviated sha of seven characters or more', () => {
    const fx = fixture();
    fx.model.commits[0]![0] = fx.c1.slice(0, 9);
    expect(run(fx)).toEqual([]);
  });
});

describe('passes', () => {
  test('refuses an empty statement up to --through and not after it', () => {
    const fx = fixture();
    fx.model.passes.find((row) => row[0] === 'writes')![1] = '';
    expect(run(fx)).toContain('pass writes has an empty statement');
    expect(run(fx, 'validation')).toEqual([]);
    expect(run(fx, 'writes')).toContain('pass writes has an empty statement');
  });

  test('refuses a pass with no row in final mode', () => {
    const fx = fixture();
    fx.model.passes = fx.model.passes.filter((row) => row[0] !== 'output');
    expect(run(fx, undefined, true)).toContain('pass output has an empty statement');
  });
});

describe('sites', () => {
  test('refuses a site in the tree with no row', () => {
    const fx = fixture();
    fx.model.sites = fx.model.sites.slice(0, 1);
    expect(run(fx)).toContain(`site is missing from the document: ${DROP_KEY}`);
  });

  test('refuses a row whose site is gone from the tree', () => {
    const fx = fixture();
    fx.model.sites.push(['src/a.ts::gone::template::x', 'bound', 'no longer there']);
    expect(run(fx)).toContain('site is stale, not in the tree: src/a.ts::gone::template::x');
  });

  test('refuses a site with no class, from the identifiers pass on only', () => {
    const fx = fixture();
    fx.model.sites[1]![1] = '';
    expect(run(fx)).toContain(`site has no class: ${DROP_KEY}`);
    expect(run(fx, 'scope')).toEqual([]);
  });

  test('refuses a class that is neither a known class nor a finding id', () => {
    const fx = fixture();
    fx.model.sites[1]![1] = 'probably fine';
    expect(has(run(fx), 'site has no class')).toBe(true);
    fx.model.sites[1]![1] = 'f-1';
    expect(run(fx)).toEqual([]);
  });

  test('refuses a validated reason that names no symbol in the site file', () => {
    const fx = fixture();
    fx.model.sites[0]![2] = 'it is validated somewhere';
    expect(has(run(fx), 'reason names no symbol that exists in its file')).toBe(true);
    fx.model.sites[0]![2] = 'goes through `assertField`';
    expect(has(run(fx), 'reason names no symbol that exists in its file')).toBe(true);
    fx.model.sites[0]![2] = 'goes through `escapeIdent()`';
    expect(run(fx)).toEqual([]);
  });

  test('refuses a quoted reason that names no symbol, and ignores a symbol only in a comment', () => {
    const fx = fixture();
    seed(fx.scratch, { 'apps/orm/src/a.ts': `// quoteIdent lives elsewhere\n${A_TS}${DROP_TS}` });
    fx.model.front.reviewed_head = head(fx.scratch);
    fx.model.commits.push([head(fx.scratch), 'chore: comment', 'identifiers']);
    fx.model.sites[0] = [SELECT_KEY, 'quoted', 'wrapped by `quoteIdent`'];
    expect(has(run(fx), 'reason names no symbol that exists in its file')).toBe(true);
  });

  test('matches a key containing a pipe through the escaped cell', () => {
    const fx = fixture();
    seed(fx.scratch, {
      'apps/orm/src/b.ts': `export const pick = (a: string, b: string): string => \`X \${a || b}\`;\n`,
    });
    const key = 'src/b.ts::pick::template::a || b';
    fx.model.front.reviewed_head = head(fx.scratch);
    fx.model.commits.push([head(fx.scratch), 'feat: b', 'identifiers']);
    fx.model.sites.push([key, 'bound', 'a value']);
    expect(run(fx)).toEqual([]);
  });
});

describe('findings', () => {
  test('refuses an open finding, and only for passes up to --through', () => {
    const fx = fixture();
    fx.model.findings.push(['f-3', 'output', 'open', '', '', '', '', '', 'fable']);
    expect(run(fx)).toContain('finding f-3 is open');
    expect(run(fx, 'writes')).toEqual([]);
    expect(run(fx, 'output')).toContain('finding f-3 is open');
  });

  test('refuses an unknown status and an unknown pass', () => {
    const fx = fixture();
    fx.model.findings[1]![2] = 'later';
    fx.model.findings[0]![1] = 'everything';
    const lines = run(fx);
    expect(has(lines, 'finding f-2 has unknown status "later"')).toBe(true);
    expect(has(lines, 'finding f-1 names unknown pass "everything"')).toBe(true);
  });

  test('refuses a duplicate id and an empty reviewer', () => {
    const fx = fixture();
    fx.model.findings[1]![0] = 'f-1';
    fx.model.findings[2]![8] = '';
    const lines = run(fx);
    expect(lines).toContain('finding id f-1 is used twice');
    expect(lines).toContain('finding o-1 has an empty reviewer');
  });

  test('refuses a fixed finding with no payload', () => {
    const fx = fixture();
    fx.model.findings[0]![3] = '';
    expect(run(fx)).toContain('finding f-1 is fixed and has no payload');
  });

  test('refuses a fix commit that is not an ancestor of HEAD', () => {
    const fx = fixture();
    fx.model.findings[0]![5] = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    expect(has(run(fx), 'finding f-1 fix deadbeef')).toBe(true);
    fx.model.findings[0]![5] = '';
    expect(run(fx)).toContain('finding f-1 fix (none) is not an ancestor of HEAD');
  });

  test('refuses a test path that does not exist, or that leaves the repository', () => {
    const fx = fixture();
    fx.model.findings[0]![6] = 'apps/orm/tests/missing.test.ts';
    expect(run(fx)).toContain('finding f-1 test apps/orm/tests/missing.test.ts does not exist');
    fx.model.findings[0]![6] = '../outside.ts';
    expect(has(run(fx), 'does not exist')).toBe(true);
  });

  test('refuses a fixed or refuted finding without a captured output file', () => {
    const fx = fixture();
    fx.model.findings[0]![4] = 'out/absent.txt';
    fx.model.findings[1]![4] = '';
    const lines = run(fx);
    expect(lines).toContain('finding f-1 has no captured output file');
    expect(lines).toContain('finding f-2 has no captured output file');
  });

  test('refuses an output file that is empty or outside the audit directory', () => {
    const fx = fixture();
    write(fx.scratch, 'audit/out/empty.txt', '');
    write(fx.scratch, 'elsewhere.txt', 'captured\n');
    fx.model.findings[0]![4] = 'out/empty.txt';
    fx.model.findings[1]![4] = '../elsewhere.txt';
    const lines = run(fx);
    expect(lines).toContain('finding f-1 has no captured output file');
    expect(lines).toContain('finding f-2 has no captured output file');
  });

  test('refuses an acceptance without the maintainer, a date and the quoted words', () => {
    const fx = fixture();
    for (const cell of ['', 'accepted', 'maintainer 2026-11-06', '"ship it"', 'maintainer later "ship it"']) {
      fx.model.findings[2]![7] = cell;
      expect(has(run(fx), 'finding o-1 is accepted without')).toBe(true);
    }
  });

  test('refuses an acceptance the notes Security section does not mention', () => {
    const fx = fixture();
    write(
      fx.scratch,
      NOTES,
      '## 0.3.0\n\n### Security\n\nNothing here.\n\n### Fixed\n\nThe limit in o-1 is mentioned here.\n',
    );
    expect(run(fx)).toContain("finding o-1 is accepted and the notes' Security section does not mention it");
  });

  test('does not read o-10 as o-1 in the notes', () => {
    const fx = fixture();
    write(fx.scratch, NOTES, '### Security\n\nThe limit in o-10 stays.\n');
    expect(has(run(fx), 'Security section does not mention it')).toBe(true);
  });

  test('refuses an acceptance when the notes page is missing', () => {
    const fx = fixture();
    rmSync(join(fx.scratch.dir, NOTES));
    expect(has(run(fx), 'Security section does not mention it')).toBe(true);
  });
});

describe('re-fires and the sample', () => {
  test('refuses a re-fire whose output is not a captured file', () => {
    const fx = fixture();
    fx.model.refires[0]![2] = 'out/none.txt';
    expect(run(fx)).toContain(`re-fire of ${SELECT_KEY} has no captured output file`);
  });

  test('final mode refuses a sampled site with no re-fire row; the default does not', () => {
    const fx = fixture();
    fx.model.refires = [];
    expect(run(fx)).toEqual([]);
    expect(run(fx, undefined, true)).toContain(`sampled site has no re-fire row: ${SELECT_KEY}`);
  });

  test('sample leaves out constant sites, is stable, and has a floor of 25', () => {
    const keys = Array.from({ length: 40 }, (_, i) => `k${i}`);
    const classes = new Map(keys.map((key, i) => [key, i < 10 ? 'constant' : 'bound']));
    const first = sampleSites('abc', keys, classes);
    expect(first).toEqual(sampleSites('abc', [...keys].reverse(), classes));
    expect(first).toHaveLength(25);
    expect(first.some((key) => classes.get(key) === 'constant')).toBe(false);
    expect(sampleSites('abd', keys, classes)).not.toEqual(first);
  });

  test('sample is ten per cent above the floor', () => {
    const keys = Array.from({ length: 400 }, (_, i) => `k${i}`);
    expect(sampleSites('abc', keys, new Map())).toHaveLength(40);
    expect(sampleSites('abc', keys.slice(0, 5), new Map())).toHaveLength(5);
  });
});

describe('the document format', () => {
  test('splits cells on unescaped pipes only', () => {
    expect(splitCells('| a | b \\| c | |')).toEqual(['a', 'b | c', '']);
  });

  test('reads scope as a list or as one line', () => {
    const listed = parseReview('---\nscope:\n  - apps/orm/src\n  - .github/\n---\n');
    expect(listed.lists.scope).toEqual(['apps/orm/src', '.github/']);
    const fx = fixture();
    fx.model.front.scope = '';
    const text = render(fx.model).replace('scope: \n', 'scope:\n  - apps/orm/src\n  - apps/vscode-extension\n');
    mkdirSync(dirname(fx.review), { recursive: true });
    writeFileSync(fx.review, text);
    expect(checkReview({ repo: fx.scratch.dir, review: fx.review }).violations).not.toContain(
      'frontmatter has no scope',
    );
  });
});

describe('the command line', () => {
  const cli = (fx: Fixture, ...args: string[]) =>
    spawnSync(process.execPath, [CHECK, fx.review, ...args], {
      cwd: fx.scratch.dir,
      env: fx.scratch.env,
      encoding: 'utf8',
    });

  test('exits zero on a valid document and prints the maintainer summary in final mode', () => {
    const fx = fixture();
    run(fx);
    const done = cli(fx, '--final');
    expect(done.status).toBe(0);
    expect(done.stdout).toContain('accepted o-1: maintainer 2026-11-06 "ship it with this limit"');
    expect(done.stdout).toContain('pass scope: scope was read');
    expect(done.stdout).toMatch(/sha256 [0-9a-f]{64}/);
  });

  test('exits non-zero with one line per violation', () => {
    const fx = fixture();
    fx.model.findings.push(['f-3', 'output', 'open', '', '', '', '', '', 'fable']);
    run(fx);
    const refused = cli(fx);
    expect(refused.status).toBe(1);
    expect(refused.stdout.trim().split('\n')).toEqual(['finding f-3 is open']);
  });

  test('--through limits the open-finding rule and rejects an unknown pass', () => {
    const fx = fixture();
    fx.model.findings.push(['f-3', 'output', 'open', '', '', '', '', '', 'fable']);
    run(fx);
    expect(cli(fx, '--through', 'writes').status).toBe(0);
    expect(cli(fx, '--through', 'nonsense').status).toBe(2);
  });

  test('--sample prints the sampled keys', () => {
    const fx = fixture();
    run(fx);
    const printed = cli(fx, '--sample');
    expect(printed.status).toBe(0);
    expect(printed.stdout.trim()).toBe(SELECT_KEY);
  });
});
