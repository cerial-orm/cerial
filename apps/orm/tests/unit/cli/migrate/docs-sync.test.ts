/**
 * The flags `cerial migrate <sub> --help` prints and the flags `cli/migrate.mdx` documents must be the same set.
 * Spawns the real CLI, so a flag added to or dropped from the command shows up here without anyone remembering the page.
 */

import { beforeAll, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CLI = resolve(import.meta.dir, '../../../../bin/cerial.ts');
const PAGE = resolve(import.meta.dir, '../../../../../docs/content/docs/cli/migrate.mdx');
const SUBCOMMANDS = ['status', 'plan', 'apply', 'baseline'] as const;
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/** Long flags named in the OPTIONS block of a help text. */
function helpFlags(help: string): Set<string> {
  const options = help.replace(ANSI, '').split(/^OPTIONS\s*$/m)[1] ?? '';

  return new Set(options.match(/--[a-z][a-z0-9-]*/g) ?? []);
}

/** Long flags in the first column of the page's flag tables, grouped by the `##` section they sit in. */
function pageFlags(page: string): Map<string, Set<string>> {
  const sections = new Map<string, Set<string>>();
  let section = '';
  for (const line of page.split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) section = heading[1]!;
    const row = /^\|\s*`([^`]*--[^`]*)`\s*\|/.exec(line);
    if (!row) continue;
    const found = sections.get(section) ?? new Set<string>();
    for (const flag of row[1]!.match(/--[a-z][a-z0-9-]*/g) ?? []) found.add(flag);
    sections.set(section, found);
  }

  return sections;
}

/** Flags the page documents for one subcommand: the shared table plus that subcommand's own section. */
function documentedFor(sections: Map<string, Set<string>>, sub: string): Set<string> {
  return new Set([...(sections.get('Flags') ?? []), ...(sections.get(sub) ?? [])]);
}

/** Every flag the page documents, to compare against the union of what the CLI prints. */
function documentedAnywhere(sections: Map<string, Set<string>>): Set<string> {
  return new Set([...sections.values()].flatMap((flags) => [...flags]));
}

async function help(sub: string): Promise<string> {
  const proc = Bun.spawn(['bun', CLI, 'migrate', sub, '--help'], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (code !== 0) throw new Error(`migrate ${sub} --help exited ${code}`);

  return stdout;
}

const real = new Map<string, Set<string>>();
let page = '';

beforeAll(async () => {
  page = readFileSync(PAGE, 'utf8');
  for (const sub of SUBCOMMANDS) real.set(sub, helpFlags(await help(sub)));
});

describe('cli/migrate.mdx flag sync', () => {
  for (const sub of SUBCOMMANDS) {
    it(`documents every flag of migrate ${sub}`, () => {
      const documented = documentedFor(pageFlags(page), sub);
      const missing = [...real.get(sub)!].filter((flag) => !documented.has(flag));

      expect(real.get(sub)!.size).toBeGreaterThan(0);
      expect(missing).toEqual([]);
    });

    it(`documents no flag migrate ${sub} lacks`, () => {
      const real_ = real.get(sub)!;
      const extra = [...documentedFor(pageFlags(page), sub)].filter((flag) => !real_.has(flag));

      expect(extra).toEqual([]);
    });
  }

  it('documents no flag that no subcommand has', () => {
    const all = new Set([...real.values()].flatMap((flags) => [...flags]));
    const extra = [...documentedAnywhere(pageFlags(page))].filter((flag) => !all.has(flag));

    expect(extra).toEqual([]);
  });

  describe('detection', () => {
    it('reports a flag removed from the page', () => {
      const edited = page.replace(/^\| `--accept-drift`.*\n/m, '');
      const documented = documentedFor(pageFlags(edited), 'baseline');

      expect([...real.get('baseline')!].filter((flag) => !documented.has(flag))).toEqual(['--accept-drift']);
    });

    it('reports a documented flag the command does not have', () => {
      const edited = page.replace(/^(\| `--json` \|.*)$/m, '$1\n| `--no-such-flag` | Not real |');
      const documented = documentedFor(pageFlags(edited), 'status');

      expect([...documented].filter((flag) => !real.get('status')!.has(flag))).toEqual(['--no-such-flag']);
    });
  });
});
