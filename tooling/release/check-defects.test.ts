// The defect gate against a scratch tree: one valid ledger, and one test per way it must refuse.

import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { newScratch, removeScratchesAfterAll, write } from '../hooks/test-support.ts';
import type { Scratch } from '../hooks/scratch.ts';
import { auditIds, checkDefects, parseLedger, testPresence } from './check-defects.ts';

removeScratchesAfterAll();

const SCRIPT = join(import.meta.dir, 'check-defects.ts');
const HEADERS = ['id', 'source', 'defect', 'test file', 'test name', 'status', 'revert'];
const TEST_FILE = 'apps/orm/tests/e2e/a.test.ts';
const TEST_SOURCE = [
  "test('keeps the row', () => {});",
  "test.skip('is skipped', () => {});",
  "it.todo('is a todo');",
  "test.failing('is failing', () => {});",
  'describe(\'group\', () => { it("quoted name", () => {}); });',
  "// test('only in a comment', () => {});",
  '',
].join('\n');
const REVERT = 'diff abc1234; `out/ab-1.txt`; bun run build ran';
const AUDIT_ONE = [
  '# Audit',
  '## Executive Summary',
  '| Severity | Count |',
  '| --- | --- |',
  '| CRITICAL | 1 |',
  '## A. Security',
  '| ID | Sev | Issue |',
  '| --- | --- | --- |',
  '| AB-1 | high | one |',
  '| **CD-2** | low | two |',
  '| ~~EF-3~~ | refuted | three |',
  '## G. Later',
  '| ID | Sev |',
  '| --- | --- |',
  '| GH-9 | low |',
  '',
].join('\n');
const AUDIT_TWO = [
  '# Audit two',
  '## Part 1: Verification',
  '### 1.1 Corrections',
  '| ID | Sev |',
  '| --- | --- |',
  '| `IJ-4` | high |',
  '## Part 2: New findings',
  '| ID | Sev |',
  '| --- | --- |',
  '| KL-5 | high |',
  '',
].join('\n');

type Row = string[];

interface Fixture {
  scratch: Scratch;
  rows: Row[];
  headers: string[];
  audits: string[];
  require: string[];
}

const table = (headers: string[], rows: Row[]): string =>
  [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');

const pinned = (id: string): Row => [id, 'audit', 'a defect', TEST_FILE, 'keeps the row', 'pinned', REVERT];

function fixture(): Fixture {
  const scratch = newScratch();
  write(scratch, TEST_FILE, TEST_SOURCE);
  write(scratch, 'audit/out/ab-1.txt', 'failing output\n');
  write(scratch, 'audit/one.md', AUDIT_ONE);
  write(scratch, 'audit/two.md', AUDIT_TWO);
  const rows = [
    pinned('AB-1'),
    ['CD-2', 'audit', 'a defect', TEST_FILE, 'quoted name', 'pinned', ''],
    ['EF-3', 'audit', 'a defect', '', '', 'declined (owner decision on 2026-10-02)', ''],
    ['IJ-4', 'audit', 'a defect', TEST_FILE, 'keeps the row', 'pinned', ''],
  ];

  return {
    scratch,
    rows,
    headers: HEADERS,
    audits: ['audit/one.md', 'audit/two.md'],
    require: ['AB-1'],
  };
}

function run(fx: Fixture): string[] {
  write(fx.scratch, 'audit/ledger.md', `# Ledger\n\n${table(fx.headers, fx.rows)}\n`);

  return checkDefects({
    repo: fx.scratch.dir,
    ledger: join(fx.scratch.dir, 'audit/ledger.md'),
    require: fx.require,
    audits: fx.audits.map((audit) => join(fx.scratch.dir, audit)),
  });
}

const has = (lines: string[], text: string): boolean => lines.some((line) => line.includes(text));

describe('a valid ledger', () => {
  test('passes', () => {
    expect(run(fixture())).toEqual([]);
  });

  test('accepts a revert path relative to the repository root', () => {
    const fx = fixture();
    fx.rows[0]![6] = 'diff abc1234; `audit/out/ab-1.txt`; bun run build ran';
    expect(run(fx)).toEqual([]);
  });
});

describe('required ids', () => {
  test('refuses a required id with no row', () => {
    const fx = fixture();
    fx.require = ['AB-1', 'ZZ-7'];
    expect(has(run(fx), 'required id ZZ-7 has no row')).toBe(true);
  });

  test('refuses a duplicate id', () => {
    const fx = fixture();
    fx.rows.push(pinned('CD-2'));
    expect(has(run(fx), 'CD-2 has two rows')).toBe(true);
  });
});

describe('audit ids', () => {
  test('refuses an audit id with no row, in a section A to F', () => {
    const fx = fixture();
    fx.rows = fx.rows.filter((row) => row[0] !== 'CD-2');
    expect(has(run(fx), 'CD-2 from one.md has no row')).toBe(true);
  });

  test('refuses an id in Part 1 with no row', () => {
    const fx = fixture();
    fx.rows = fx.rows.filter((row) => row[0] !== 'IJ-4');
    expect(has(run(fx), 'IJ-4 from two.md has no row')).toBe(true);
  });

  test('derives ids from the first cell, markdown stripped, only in scope', () => {
    expect(auditIds(AUDIT_ONE).ids).toEqual(['AB-1', 'CD-2', 'EF-3']);
    expect(auditIds(AUDIT_TWO).ids).toEqual(['IJ-4']);
  });

  test('refuses an audit file with no section in scope', () => {
    const fx = fixture();
    write(fx.scratch, 'audit/none.md', '## Notes\n\n| ID |\n| --- |\n| QR-1 |\n');
    fx.audits.push('audit/none.md');
    expect(has(run(fx), 'none.md has no section A to F or Part 1')).toBe(true);
  });

  test('refuses an audit file that does not exist', () => {
    const fx = fixture();
    fx.audits.push('audit/missing.md');
    expect(has(run(fx), 'missing.md does not exist')).toBe(true);
  });
});

describe('the test of a pinned row', () => {
  test('refuses a test file that does not exist', () => {
    const fx = fixture();
    fx.rows[1]![3] = 'apps/orm/tests/e2e/gone.test.ts';
    expect(has(run(fx), 'CD-2 test file apps/orm/tests/e2e/gone.test.ts does not exist')).toBe(true);
  });

  test('refuses a test file outside the repository', () => {
    const fx = fixture();
    fx.rows[1]![3] = '../../etc/hosts';
    expect(has(run(fx), 'CD-2 test file')).toBe(true);
  });

  test('refuses a name the file does not hold', () => {
    const fx = fixture();
    fx.rows[1]![4] = 'never written';
    expect(has(run(fx), 'CD-2 test "never written" is not in')).toBe(true);
  });

  test('refuses a name that only appears in a comment', () => {
    const fx = fixture();
    fx.rows[1]![4] = 'only in a comment';
    expect(has(run(fx), 'is not in')).toBe(true);
  });

  test.each(['is skipped', 'is a todo', 'is failing'])('refuses a disabled test: %s', (name) => {
    const fx = fixture();
    fx.rows[1]![4] = name;
    expect(has(run(fx), 'is skipped, pending or failing')).toBe(true);
  });

  test('refuses an empty test name', () => {
    const fx = fixture();
    fx.rows[1]![4] = '';
    expect(has(run(fx), 'CD-2 has no test name')).toBe(true);
  });

  test('tells an active test from a disabled one', () => {
    expect(testPresence(TEST_SOURCE, 'keeps the row')).toBe('active');
    expect(testPresence(TEST_SOURCE, 'is skipped')).toBe('disabled');
    expect(testPresence(TEST_SOURCE, 'nothing')).toBe('absent');
  });
});

describe('status', () => {
  test('refuses a status other than pinned or declined', () => {
    const fx = fixture();
    fx.rows[1]![5] = 'open';
    expect(has(run(fx), 'CD-2 has status "open", not pinned or declined')).toBe(true);
  });

  test('refuses a declined row that cites no decision', () => {
    const fx = fixture();
    fx.rows[2]![5] = 'declined';
    expect(has(run(fx), 'EF-3 is declined and cites no decision')).toBe(true);
  });

  test('accepts a decision in its own column', () => {
    const fx = fixture();
    fx.headers = [...HEADERS, 'decision'];
    fx.rows = fx.rows.map((row) => [...row, '']);
    fx.rows[2]![5] = 'declined';
    fx.rows[2]![7] = 'owner decision 2026-10-02';
    expect(run(fx)).toEqual([]);
  });
});

describe('revert evidence', () => {
  test('refuses an empty revert on a required row', () => {
    const fx = fixture();
    fx.rows[0]![6] = '';
    expect(has(run(fx), 'AB-1 is required and has no revert evidence')).toBe(true);
  });

  test('refuses a revert that names no output path', () => {
    const fx = fixture();
    fx.rows[0]![6] = 'diff abc1234; bun run build ran';
    expect(has(run(fx), 'AB-1 revert names no failing output path')).toBe(true);
  });

  test('refuses an output path that is missing', () => {
    const fx = fixture();
    fx.rows[0]![6] = 'diff abc1234; `out/nowhere.txt`; bun run build ran';
    expect(has(run(fx), 'out/nowhere.txt is missing or empty')).toBe(true);
  });

  test('refuses an output file that is empty', () => {
    const fx = fixture();
    write(fx.scratch, 'audit/out/empty.txt', '');
    fx.rows[0]![6] = 'diff abc1234; `out/empty.txt`; bun run build ran';
    expect(has(run(fx), 'out/empty.txt is missing or empty')).toBe(true);
  });

  test('refuses a revert with no diff hash', () => {
    const fx = fixture();
    fx.rows[0]![6] = '`out/ab-1.txt`; bun run build ran';
    expect(has(run(fx), 'AB-1 revert records no diff hash')).toBe(true);
  });

  test('refuses a hash that is not hex', () => {
    const fx = fixture();
    fx.rows[0]![6] = 'diff zzzzzzz; `out/ab-1.txt`; bun run build ran';
    expect(has(run(fx), 'AB-1 revert records no diff hash')).toBe(true);
  });

  test('refuses a revert that does not record the build', () => {
    const fx = fixture();
    fx.rows[0]![6] = 'diff abc1234; `out/ab-1.txt`';
    expect(has(run(fx), 'AB-1 revert does not record that bun run build ran')).toBe(true);
  });

  test('accepts a hash that matches the cited diff file, refuses one that does not', () => {
    const fx = fixture();
    write(fx.scratch, 'audit/out/ab-1.diff', 'the breaking diff\n');
    const digest = createHash('sha256').update('the breaking diff\n').digest('hex');
    fx.rows[0]![6] = `diff ${digest.slice(0, 12)}; \`out/ab-1.diff\`; \`out/ab-1.txt\`; bun run build ran`;
    expect(run(fx)).toEqual([]);
    fx.rows[0]![6] = 'diff 0000000; `out/ab-1.diff`; `out/ab-1.txt`; bun run build ran';
    expect(has(run(fx), 'AB-1 revert hash 0000000 does not match the SHA-256 of out/ab-1.diff')).toBe(true);
  });

  test('refuses a cited diff file that is missing', () => {
    const fx = fixture();
    fx.rows[0]![6] = 'diff abc1234; `out/gone.diff`; `out/ab-1.txt`; bun run build ran';
    expect(has(run(fx), 'AB-1 revert diff out/gone.diff is missing or empty')).toBe(true);
  });

  test('does not ask a row that is not required for a revert', () => {
    const fx = fixture();
    expect(fx.rows[1]![6]).toBe('');
    expect(run(fx)).toEqual([]);
  });
});

describe('the ledger itself', () => {
  test('refuses a document with no ledger table', () => {
    const scratch = newScratch();
    write(scratch, 'ledger.md', '# Nothing here\n');
    const lines = checkDefects({ repo: scratch.dir, ledger: join(scratch.dir, 'ledger.md') });
    expect(lines).toEqual(['the ledger has no table with a "test file" column']);
  });

  test('parses rows by header', () => {
    const parsed = parseLedger(table(HEADERS, [pinned('AB-1')]));
    expect(parsed.rows[0]?.cells['test name']).toBe('keeps the row');
  });
});

describe('the command line', () => {
  test('exits 1 and prints one line per violation, 0 when clean', () => {
    const fx = fixture();
    run(fx);
    const args = [
      SCRIPT,
      join(fx.scratch.dir, 'audit/ledger.md'),
      '--require',
      'AB-1,ZZ-7',
      '--audit',
      join(fx.scratch.dir, 'audit/one.md'),
      join(fx.scratch.dir, 'audit/two.md'),
    ];
    const bad = spawnSync('bun', args, { cwd: fx.scratch.dir, encoding: 'utf8' });
    expect(bad.status).toBe(1);
    expect(bad.stdout.trim().split('\n')).toEqual(['required id ZZ-7 has no row']);

    args[3] = 'AB-1';
    expect(spawnSync('bun', args, { cwd: fx.scratch.dir, encoding: 'utf8' }).status).toBe(0);
  });

  test('exits 2 without a ledger', () => {
    expect(spawnSync('bun', [SCRIPT], { encoding: 'utf8' }).status).toBe(2);
  });
});
