import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ArgsDef } from 'citty';
import { convertCommand } from '../../../../src/cli/commands/convert';
import { LOSSY_CASES } from '../../../../src/cli/convert';
import { droppedNotice } from '../../../../src/cli/convert/run';

const PAGE = resolve(import.meta.dir, '../../../../../docs/content/docs/cli/convert.mdx');

interface DocSource {
  readonly constructs: readonly { readonly id: string; readonly construct: string }[];
  readonly flags: readonly { readonly name: string; readonly alias?: string }[];
  readonly dropSentence: string;
}

function flagTable(page: string): string[] {
  const start = page.indexOf('| Flag |');
  if (start === -1) return [];

  return page
    .slice(start)
    .split('\n')
    .filter((line) => line.startsWith('|'));
}

/** Everything the page lacks, one message per gap. Pure, so the test can feed it a damaged page. */
export function findDocDrift(page: string, source: DocSource): string[] {
  const problems: string[] = [];
  const rows = flagTable(page);

  for (const { id, construct } of source.constructs) {
    if (!page.includes(construct)) problems.push(`construct of '${id}' is missing from the page`);
  }

  for (const { name, alias } of source.flags) {
    const flag = `--${name}`;
    const row = rows.find((line) => line.split('|')[1]?.match(new RegExp(`${flag}(?![\\w-])`)));
    if (!row) problems.push(`flag ${flag} is missing from the flag table`);
    else if (alias && !row.split('|')[1]?.includes(`-${alias},`))
      problems.push(`alias -${alias} of ${flag} is missing`);
  }

  if (!page.includes(source.dropSentence)) problems.push('the --help drop sentence is not on the page verbatim');

  return problems;
}

const args = convertCommand.args as ArgsDef;

const SOURCE: DocSource = {
  constructs: LOSSY_CASES.map(({ id, construct }) => ({ id, construct })),
  flags: Object.entries(args).map(([name, def]) => ({
    name,
    alias: 'alias' in def && typeof def.alias === 'string' ? def.alias : undefined,
  })),
  dropSentence: droppedNotice(),
};

describe('convert page against the code', () => {
  it('enumerates the flags from the command rather than a list', () => {
    expect(SOURCE.flags.length).toBeGreaterThan(5);
    expect(SOURCE.flags.map((flag) => flag.name)).toContain('remove-source');
  });

  it('carries every lossy construct, every flag and the --help drop sentence', async () => {
    const page = await readFile(PAGE, 'utf8');

    expect(findDocDrift(page, SOURCE)).toEqual([]);
  });

  it('reports a construct row removed from the page', async () => {
    const page = await readFile(PAGE, 'utf8');
    const lossy = LOSSY_CASES[0]!;
    const damaged = page
      .split('\n')
      .filter((line) => !line.includes(lossy.construct))
      .join('\n');

    expect(findDocDrift(damaged, SOURCE)).toEqual([`construct of '${lossy.id}' is missing from the page`]);
  });

  it('reports a flag removed from the table', async () => {
    const page = await readFile(PAGE, 'utf8');
    const damaged = page
      .split('\n')
      .filter((line) => !line.startsWith('| `--dry-run`'))
      .join('\n');

    expect(findDocDrift(damaged, SOURCE)).toEqual(['flag --dry-run is missing from the flag table']);
  });

  it('does not count a flag mentioned only in prose', async () => {
    const page = await readFile(PAGE, 'utf8');
    const damaged = page
      .split('\n')
      .filter((line) => !line.startsWith('| `--force`'))
      .join('\n');

    expect(damaged).toContain('--force');
    expect(findDocDrift(damaged, SOURCE)).toEqual(['flag --force is missing from the flag table']);
  });

  it('reports a changed drop sentence', async () => {
    const page = await readFile(PAGE, 'utf8');
    const damaged = page.replaceAll('does not preserve TypeScript comments', 'keeps TypeScript comments');

    expect(findDocDrift(damaged, SOURCE)).toEqual(['the --help drop sentence is not on the page verbatim']);
  });
});
