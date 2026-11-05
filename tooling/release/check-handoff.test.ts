// The handoff gate against a scratch repository: one ready tree, and one test per way it must refuse.

import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import type { Scratch } from '../hooks/scratch.ts';
import { newScratch, removeScratchesAfterAll, seed, write } from '../hooks/test-support.ts';
import { checkHandoff, REQUIRED_ROWS, runbook, type Published } from './check-handoff.ts';

removeScratchesAfterAll();

const CHECK = join(import.meta.dir, 'check-handoff.ts');
const ORM_NOTES = 'apps/docs/content/docs/releases/orm/0/3.mdx';
const EXT_NOTES = 'apps/docs/content/docs/releases/extension/0/2.mdx';
const NOT_PUBLISHED = (): Published => 'no';

function statusTable(overrides: Record<string, string> = {}): string {
  const rows = [...REQUIRED_ROWS.slice(0, 11), '12', '13'].map((id) => {
    const cells = overrides[id] ?? (id === '12' ? '2/32 | in progress' : '5/5 | done');

    return `| ${id} | title | ${cells} |`;
  });

  return ['# Program status', '', '| id | title | done | state |', '|---|---|---|---|', ...rows, ''].join('\n');
}

function fixture(): { scratch: Scratch; dir: string; status: string; git: (...args: string[]) => { out: string } } {
  const scratch = newScratch();
  seed(scratch, {
    'apps/orm/package.json': '{ "name": "cerial", "version": "0.3.0" }\n',
    'apps/vscode-extension/package.json': '{ "name": "cerial-vscode", "version": "0.2.0" }\n',
    [ORM_NOTES]: '## 0.3.0\n\nNotes.\n',
    [EXT_NOTES]:
      '## 0.2.0\n\n### Download\n\n| Version | Download |\n|---|---|\n| v0.2.0 | [vsix](https://example.com/a.vsix) |\n',
  });
  write(scratch, 'STATUS.md', statusTable());

  return {
    scratch,
    dir: scratch.dir,
    status: join(scratch.dir, 'STATUS.md'),
    git: (...args) => ({ out: scratch.git(...args).stdout }),
  };
}

function run(f: ReturnType<typeof fixture>, extra: Partial<Parameters<typeof checkHandoff>[0]> = {}): string[] {
  return checkHandoff({
    repo: f.dir,
    status: f.status,
    version: '0.3.0',
    extVersion: '0.2.0',
    published: NOT_PUBLISHED,
    ...extra,
  });
}

describe('check-handoff', () => {
  test('a ready tree passes', () => {
    expect(run(fixture())).toEqual([]);
  });

  test('the runbook prints commands and runs none', () => {
    expect(runbook('0.3.0', '0.2.0').join('\n')).toContain('orm-v0.3.0');
  });

  test('a malformed version is refused', () => {
    expect(run(fixture(), { version: 'latest' })).toEqual(['--version latest is not a version like 1.2.3']);
  });

  test('a missing status table is refused', () => {
    const f = fixture();
    expect(run(f, { status: join(f.dir, 'nope.md') }).join('\n')).toContain('does not exist');
  });

  for (const id of REQUIRED_ROWS) {
    test(`row ${id} not finished is refused`, () => {
      const f = fixture();
      write(f.scratch, 'STATUS.md', statusTable({ [id]: '4/5 | in progress' }));
      expect(run(f)).toEqual([`status row ${id} is 4/5 and in progress, not done`]);
    });
  }

  test('a row at n/n whose state is not done is refused', () => {
    const f = fixture();
    write(f.scratch, 'STATUS.md', statusTable({ '04': '5/5 | blocked' }));
    expect(run(f)).toEqual(['status row 04 is 5/5 and blocked, not done']);
  });

  test('a row with zero tasks is refused', () => {
    const f = fixture();
    write(f.scratch, 'STATUS.md', statusTable({ '07': '0/0 | done' }));
    expect(run(f)).toEqual(['status row 07 is 0/0 and done, not done']);
  });

  test('a missing row is refused, so twelve rows must be read', () => {
    const f = fixture();
    write(f.scratch, 'STATUS.md', statusTable().replace(/^\| 13 .*$/m, ''));
    expect(run(f)).toEqual(['status row 13 is missing']);
  });

  test('the orm package at another version is refused', () => {
    const f = fixture();
    write(f.scratch, 'apps/orm/package.json', '{ "version": "0.2.0" }\n');
    expect(run(f)).toEqual(['apps/orm/package.json holds 0.2.0, not 0.3.0 (orm)']);
  });

  test('the extension package at another version is refused', () => {
    const f = fixture();
    write(f.scratch, 'apps/vscode-extension/package.json', '{ "version": "0.1.0" }\n');
    expect(run(f)).toEqual(['apps/vscode-extension/package.json holds 0.1.0, not 0.2.0 (extension)']);
  });

  test('an unreadable package.json is refused', () => {
    const f = fixture();
    write(f.scratch, 'apps/orm/package.json', '{ not json');
    expect(run(f)).toEqual(['apps/orm/package.json holds no version, not 0.3.0 (orm)']);
  });

  test('an orm notes page without the version heading is refused', () => {
    const f = fixture();
    write(f.scratch, ORM_NOTES, '## 0.2.9\n');
    expect(run(f)).toEqual([`${ORM_NOTES} has no "## 0.3.0" heading`]);
  });

  test('a missing orm notes page is refused', () => {
    const f = fixture();
    expect(run(f, { version: '0.4.0' }).join('\n')).toContain('orm notes page');
  });

  test('extension notes without the version heading are refused', () => {
    const f = fixture();
    write(f.scratch, EXT_NOTES, '## 0.1.9\n\n### Download\n\n| v0.1.9 | x |\n');
    expect(run(f)).toEqual([`${EXT_NOTES} has no "## 0.2.0" heading`]);
  });

  test('extension notes without a Download row are refused', () => {
    const f = fixture();
    write(f.scratch, EXT_NOTES, '## 0.2.0\n\nNotes only.\n');
    expect(run(f)).toEqual([`${EXT_NOTES} has no "### Download" row for 0.2.0`]);
  });

  test('a Download row belonging to another version is refused', () => {
    const f = fixture();
    write(f.scratch, EXT_NOTES, '## 0.2.0\n\n### Download\n\n| v0.1.0 | x |\n');
    expect(run(f)).toEqual([`${EXT_NOTES} has no "### Download" row for 0.2.0`]);
  });

  test('an existing orm tag is refused', () => {
    const f = fixture();
    f.git('tag', 'orm-v0.3.0');
    expect(run(f)).toEqual(['tag orm-v0.3.0 already exists locally']);
  });

  test('an existing extension tag is refused', () => {
    const f = fixture();
    f.git('tag', 'ext-v0.2.0');
    expect(run(f)).toEqual(['tag ext-v0.2.0 already exists locally']);
  });

  test('a version already on npm is refused', () => {
    expect(run(fixture(), { published: () => 'yes' })).toEqual(['cerial@0.3.0 is already on npm']);
  });

  test('a registry lookup that fails is not a pass', () => {
    const lines = run(fixture(), { published: () => ({ error: 'ENOTFOUND' }) });
    expect(lines).toEqual(['cannot tell whether cerial@0.3.0 is on npm: ENOTFOUND']);
  });

  test('the command line exits 2 without a version and 1 on a refusal', () => {
    const f = fixture();
    const missing = spawnSync(process.execPath, [CHECK, f.status], { cwd: f.dir, encoding: 'utf8' });
    expect(missing.status).toBe(2);
    const refused = spawnSync(process.execPath, [CHECK, f.status, '--version', '9.9.9', '--ext-version', '0.2.0'], {
      cwd: f.dir,
      encoding: 'utf8',
    });
    expect(refused.status).toBe(1);
    expect(refused.stdout).toContain('apps/orm/package.json holds 0.3.0, not 9.9.9');
  });
});
