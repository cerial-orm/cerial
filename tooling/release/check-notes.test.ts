// The notes gate against fixture ledgers and pages: one valid pair, and one test per way it must refuse,
// each beside the case that must still pass.

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkNotes, parseLedger } from './check-notes.ts';

const dir = mkdtempSync(join(tmpdir(), 'cerial-notes-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const HEADER = '| name | kind | source | section |\n|---|---|---|---|\n';
const LEDGER = `${HEADER}| escapeIdent | security | 56351bc5 | Security |\n| findOne | behavior | 38b3af25 | Changed |\n| Token | export-removed | exports | Removed |\n`;
const NOTES = [
  '---\ntitle: ORM v0.3.x\n---\n',
  '## 0.3.0\n',
  '### Security\n\n- `escapeIdent` is no longer exported.\n',
  '### Added\n\n- A new thing.\n',
  '### Changed\n\n- `findOne` rejects `offset`.\n',
  '### Removed\n\n- `Token` is renamed.\n',
].join('\n');

let counter = 0;
function run(ledger: string, notes: string, version = '0.3.0'): string[] {
  const id = counter++;
  const ledgerPath = join(dir, `ledger-${id}.md`);
  const notesPath = join(dir, `notes-${id}.mdx`);
  writeFileSync(ledgerPath, ledger);
  writeFileSync(notesPath, notes);

  return checkNotes({ ledger: ledgerPath, notes: notesPath, version });
}

describe('check-notes', () => {
  test('notes that carry every row pass', () => {
    expect(run(LEDGER, NOTES)).toEqual([]);
  });

  test('matching ignores case', () => {
    expect(run(LEDGER, NOTES.replace('`findOne`', '`FINDONE`'))).toEqual([]);
  });

  test('an empty ledger is refused', () => {
    expect(run(HEADER, NOTES)).toEqual(['the ledger has no rows']);
  });

  test('a ledger with rows is not empty', () => {
    expect(run(LEDGER, NOTES)).not.toContain('the ledger has no rows');
  });

  test('a row whose name is absent from its section is refused', () => {
    expect(run(LEDGER, NOTES.replace('`findOne` rejects `offset`.', 'Something else.'))).toEqual([
      'findOne: missing from "### Changed"',
    ]);
  });

  test('a row whose name is present in its section passes', () => {
    expect(run(`${HEADER}| findOne | behavior | x | Changed |\n`, NOTES)).toEqual([]);
  });

  test('a row under ### Added does not count', () => {
    const notes = NOTES.replace('`findOne` rejects `offset`.', 'Nothing.').replace('A new thing.', '`findOne` is new.');
    expect(run(`${HEADER}| findOne | behavior | x | Changed |\n`, notes)).toEqual([
      'findOne: missing from "### Changed"',
    ]);
  });

  test('a name present in the section its row names counts', () => {
    const ledger = `${HEADER}| findOne | behavior | x | Added |\n`;
    expect(run(ledger, NOTES.replace('A new thing.', '`findOne` is new.'))).toEqual([]);
  });

  test('a row naming a section the notes lack is refused', () => {
    expect(run(`${HEADER}| a | behavior | x | Deprecated |\n`, NOTES)).toEqual([
      'a: no "### Deprecated" section under ## 0.3.0',
    ]);
  });

  test('notes with no Security section are refused', () => {
    const notes = NOTES.replace(/### Security\n\n- .*\n\n/, '');
    expect(run(`${HEADER}| findOne | behavior | x | Changed |\n`, notes)).toEqual([
      '## 0.3.0 has no "### Security" section',
    ]);
  });

  test('a Security section that is not first is refused', () => {
    const notes = NOTES.replace('### Added\n\n- A new thing.\n\n', '').replace(
      '### Security',
      '### Added\n\n- x\n\n### Security',
    );
    expect(run(`${HEADER}| escapeIdent | s | x | Security |\n`, notes)).toEqual([
      '"### Security" is not the first section under ## 0.3.0',
    ]);
  });

  test('a Security section that comes first passes', () => {
    expect(run(`${HEADER}| escapeIdent | s | x | Security |\n`, NOTES)).toEqual([]);
  });

  test('a version with no heading is refused', () => {
    expect(run(LEDGER, NOTES, '0.4.0')).toEqual(['the notes have no "## 0.4.0" heading']);
  });

  test('sections of another version are not read', () => {
    const notes = `${NOTES}\n## 0.2.0\n\n### Changed\n\n- \`findOne\` and \`extra\`.\n`;
    expect(run(`${HEADER}| extra | b | x | Changed |\n`, notes)).toEqual(['extra: missing from "### Changed"']);
  });

  test('a heading inside a code fence is not a section', () => {
    const notes = NOTES.replace('- A new thing.', '```md\n### Security\n```');
    expect(run(LEDGER, notes)).toEqual([]);
  });

  test('a malformed version is refused', () => {
    expect(run(LEDGER, NOTES, 'latest')).toEqual(['--version latest is not a version like 1.2.3']);
  });

  test('parseLedger skips the header and separator and unescapes a pipe', () => {
    expect(parseLedger(`${HEADER}| a \\| b | k | s | Changed |\n| only | three | cells |\n`)).toEqual([
      { name: 'a | b', section: 'Changed' },
    ]);
  });
});
