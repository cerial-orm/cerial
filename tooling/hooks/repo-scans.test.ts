// The scans that need git: lines a commit adds, paths it adds, the registry, release
// notes and the ratchet. Each runs against a scratch repository's index, so what
// is judged is what the commit would carry. Rules are named by identifier.

import { describe, expect, test } from 'bun:test';
import {
  type Baseline,
  checkRatchet,
  compareVersions,
  modelNames,
  parseAddedLines,
  releaseSections,
  scanAddedCasts,
  scanBaselineRaised,
  scanReleasedSections,
  scanTableRegistry,
} from './repo-scans.ts';
import type { Scratch } from './scratch.ts';
import {
  guardRepositoryConfiguration,
  NOISE,
  newScratch,
  removeScratchesAfterAll,
  ruleNames,
  seed,
  stage,
  stagedRefusals,
  write,
} from './test-support.ts';

removeScratchesAfterAll();

const CAST = ['as', 'any'].join(' ');
const UNIT = 'apps/orm/tests/unit/a.test.ts';
const E2E = 'apps/orm/tests/e2e/users/create.test.ts';
const BASELINE: Baseline = { 'as-any': { 'apps/orm/tests/unit': 2 } };

const judged = (scratch: Scratch): string[] => ruleNames(stagedRefusals(scratch), [NOISE]);

describe('a cast to any on an added line', () => {
  const castLine = `export const value = input ${CAST};\n`;

  test('is refused', () => {
    const scratch = newScratch();
    write(scratch, UNIT, castLine);
    stage(scratch, UNIT);

    expect(judged(scratch)).toEqual(['ratchet.as-any']);
  });

  test('is accepted when the line before carries a type-error expectation with an explanation', () => {
    const scratch = newScratch();
    write(scratch, UNIT, `// @ts-expect-error negative test: the type forbids a number here\n${castLine}`);
    stage(scratch, UNIT);

    expect(judged(scratch)).toEqual([]);
  });

  test.each([
    '// @ts-expect-error',
    '// @ts-expect-error: nope',
    '// an ordinary comment',
  ])('is still refused when the line before is %s', (before) => {
    const scratch = newScratch();
    write(scratch, UNIT, `${before}\n${castLine}`);
    stage(scratch, UNIT);

    expect(judged(scratch)).toEqual(['ratchet.as-any']);
  });

  test('is accepted when it was already in the file, and only the new one is refused', () => {
    const scratch = newScratch();
    seed(scratch, { [UNIT]: castLine });
    write(scratch, UNIT, `${castLine}export const other = 1;\n`);
    stage(scratch, UNIT);

    expect(judged(scratch)).toEqual([]);

    write(scratch, UNIT, `${castLine}export const other = input ${CAST};\n`);
    stage(scratch, UNIT);

    expect(
      stagedRefusals(scratch)
        .filter((r) => r.rule === 'ratchet.as-any')
        .map((r) => r.where),
    ).toEqual([`${UNIT}:2`]);
  });

  test('is not read in a path the baseline does not record', () => {
    const scratch = newScratch();
    write(scratch, 'apps/orm/tests/parser/a.test.ts', castLine);
    stage(scratch, 'apps/orm/tests/parser/a.test.ts');

    expect(judged(scratch)).toEqual([]);
  });

  test('is not read in a file that is not code', () => {
    const scratch = newScratch();
    write(scratch, 'apps/orm/tests/unit/notes.md', castLine);
    stage(scratch, 'apps/orm/tests/unit/notes.md');

    expect(judged(scratch)).toEqual([]);
  });

  describe('judged by what is staged, not by what is on disk', () => {
    test('a cast only on disk is not refused', () => {
      const scratch = newScratch();
      write(scratch, UNIT, 'export const value = 1;\n');
      stage(scratch, UNIT);
      write(scratch, UNIT, castLine);

      expect(judged(scratch)).toEqual([]);
    });

    test('a cast only in the index is refused although the disk is clean', () => {
      const scratch = newScratch();
      write(scratch, UNIT, castLine);
      stage(scratch, UNIT);
      write(scratch, UNIT, 'export const value = 1;\n');

      expect(judged(scratch)).toEqual(['ratchet.as-any']);
    });

    test('a marker only in the index is refused in a production path although the disk is clean', () => {
      const scratch = newScratch();
      const marker = ['// f', 'ixme later\n'].join('');
      write(scratch, 'apps/orm/src/a.ts', marker);
      stage(scratch, 'apps/orm/src/a.ts');
      write(scratch, 'apps/orm/src/a.ts', 'export const a = 1;\n');

      expect(judged(scratch)).toEqual(['stub.fix-it-later']);
    });

    test('a marker only on disk is not refused', () => {
      const scratch = newScratch();
      write(scratch, 'apps/orm/src/a.ts', 'export const a = 1;\n');
      stage(scratch, 'apps/orm/src/a.ts');
      write(scratch, 'apps/orm/src/a.ts', ['// f', 'ixme later\n'].join(''));

      expect(judged(scratch)).toEqual([]);
    });
  });

  describe('as a pure scan over named lines', () => {
    const content = `a\n${CAST}\n// @ts-expect-error a reason that is long enough\nb ${CAST}\n`;

    test('only the added lines are read', () => {
      expect(scanAddedCasts(UNIT, content, [], BASELINE)).toEqual([]);
      expect(ruleNames(scanAddedCasts(UNIT, content, [2], BASELINE))).toEqual(['ratchet.as-any']);
    });

    test('an explained expectation on the line above exempts the line', () => {
      expect(scanAddedCasts(UNIT, content, [4], BASELINE)).toEqual([]);
    });

    test('the first line of a file has no line above it', () => {
      expect(ruleNames(scanAddedCasts(UNIT, `b ${CAST}`, [1], BASELINE))).toEqual(['ratchet.as-any']);
    });
  });
});

describe('schema setup in an end-to-end file, from the index', () => {
  test('is refused', () => {
    const scratch = newScratch();
    write(scratch, E2E, "await client.query('REMOVE TABLE user');\n");
    stage(scratch, E2E);

    expect(judged(scratch)).toEqual(['e2e-setup.remove-table']);
  });

  test('is accepted when the file only deletes rows', () => {
    const scratch = newScratch();
    write(scratch, E2E, "await client.query('DELETE FROM user');\n");
    stage(scratch, E2E);

    expect(judged(scratch)).toEqual([]);
  });
});

describe('a new path that an ignore pattern matches', () => {
  test('is refused', () => {
    const scratch = newScratch();
    write(scratch, '.gitignore', 'logs/\n');
    write(scratch, 'logs/run.txt', 'x\n');
    stage(scratch, '.gitignore', 'logs/run.txt');

    expect(judged(scratch)).toEqual(['paths.ignored']);
  });

  test('is accepted when no pattern matches', () => {
    const scratch = newScratch();
    write(scratch, '.gitignore', 'logs/\n');
    write(scratch, 'notes/run.txt', 'x\n');
    stage(scratch, '.gitignore', 'notes/run.txt');

    expect(judged(scratch)).toEqual([]);
  });

  test('is not asked of a path the commit only modifies', () => {
    const scratch = newScratch();
    seed(scratch, { 'logs/run.txt': 'x\n' });
    write(scratch, '.gitignore', 'logs/\n');
    write(scratch, 'logs/run.txt', 'y\n');
    stage(scratch, '.gitignore', 'logs/run.txt');

    expect(judged(scratch)).toEqual([]);
  });
});

describe('a new e2e schema whose models are missing from the tables registry', () => {
  const REGISTRY = 'apps/orm/tests/e2e/test-helper.ts';
  const SCHEMA = 'apps/orm/tests/e2e/schemas/blog/blog.cerial';

  test('is refused', () => {
    const scratch = newScratch();
    write(scratch, REGISTRY, "export const tables = { blogPost: 'blog_post' };\n");
    write(scratch, SCHEMA, 'model Orphan {\n  id Record @id\n}\n');
    stage(scratch, REGISTRY, SCHEMA);

    expect(judged(scratch)).toEqual(['registry.unregistered-table']);
  });

  test('is accepted when the table is registered, in the same commit', () => {
    const scratch = newScratch();
    write(scratch, REGISTRY, "export const tables = { blogPost: 'blog_post' };\n");
    write(scratch, SCHEMA, 'model BlogPost {\n  id Record @id\n}\n');
    stage(scratch, REGISTRY, SCHEMA);

    expect(judged(scratch)).toEqual([]);
  });

  test('is accepted when the registry was committed earlier', () => {
    const scratch = newScratch();
    seed(scratch, { [REGISTRY]: "export const tables = { blogPost: 'blog_post' };\n" });
    write(scratch, SCHEMA, 'model BlogPost {\n  id Record @id\n}\n');
    stage(scratch, SCHEMA);

    expect(judged(scratch)).toEqual([]);
  });

  test('is judged against the registry the commit carries, not the one on disk', () => {
    const scratch = newScratch();
    write(scratch, REGISTRY, "export const tables = { other: 'other' };\n");
    stage(scratch, REGISTRY);
    write(scratch, REGISTRY, "export const tables = { blogPost: 'blog_post' };\n");
    write(scratch, SCHEMA, 'model BlogPost {\n  id Record @id\n}\n');
    stage(scratch, SCHEMA);

    expect(judged(scratch)).toEqual(['registry.unregistered-table']);
  });

  test('an abstract model has no table and needs no entry', () => {
    expect(modelNames('abstract model Base {\n}\n\nmodel Real {\n}\n  model Indented {\n}')).toEqual([
      'Real',
      'Indented',
    ]);
  });

  test('a schema outside the e2e schema directory is not asked', () => {
    const scratch = newScratch();
    write(scratch, 'apps/orm/tests/unit/a.cerial', 'model Orphan {\n}\n');
    stage(scratch, 'apps/orm/tests/unit/a.cerial');

    expect(judged(scratch)).toEqual([]);
  });

  test('the table name is the snake case of the model name', () => {
    const found = scanTableRegistry([{ path: SCHEMA, content: 'model BlogPost {\n}\n' }], "'blogpost'");

    expect(ruleNames(found)).toEqual(['registry.unregistered-table']);
    expect(scanTableRegistry([{ path: SCHEMA, content: 'model BlogPost {\n}\n' }], "'blog_post'")).toEqual([]);
  });
});

describe('release notes at or below the released version', () => {
  const PACKAGE = 'apps/orm/package.json';
  const NOTES = 'apps/docs/content/docs/releases/orm/0.mdx';
  const notes = (...sections: string[]): string => `# Releases\n\n${sections.join('\n\n')}\n`;
  const RELEASED = '## 0.2.0\n\nShipped in the second release.';
  const NEXT = '## 0.3.0\n\nWritten for the next release.';
  const seeded = (): Scratch => {
    const scratch = newScratch();
    seed(scratch, { [PACKAGE]: '{"version":"0.2.0"}\n', [NOTES]: notes(NEXT, RELEASED) });

    return scratch;
  };

  test('editing the released section is refused', () => {
    const scratch = seeded();
    write(scratch, NOTES, notes(NEXT, '## 0.2.0\n\nShipped, and now reworded.'));
    stage(scratch, NOTES);

    expect(judged(scratch)).toEqual(['release-notes.released-entry-edited']);
  });

  test('removing the released section is refused', () => {
    const scratch = seeded();
    write(scratch, NOTES, notes(NEXT));
    stage(scratch, NOTES);

    expect(judged(scratch)).toEqual(['release-notes.released-entry-edited']);
  });

  test('editing a section above the released version is accepted', () => {
    const scratch = seeded();
    write(scratch, NOTES, notes('## 0.3.0\n\nRewritten before it ships.', RELEASED));
    stage(scratch, NOTES);

    expect(judged(scratch)).toEqual([]);
  });

  test('adding a section above the newest heading is accepted', () => {
    const scratch = seeded();
    write(scratch, NOTES, notes('## 0.4.0\n\nA new section.', NEXT, RELEASED));
    stage(scratch, NOTES);

    expect(judged(scratch)).toEqual([]);
  });

  test('a file that is not release notes is not read', () => {
    const scratch = seeded();
    seed(scratch, { 'apps/docs/content/docs/guide.mdx': notes(RELEASED) });
    write(scratch, 'apps/docs/content/docs/guide.mdx', notes('## 0.2.0\n\nChanged.'));
    stage(scratch, 'apps/docs/content/docs/guide.mdx');

    expect(judged(scratch)).toEqual([]);
  });

  test('the released version is the one in the last commit, so the bump commit may touch its own notes', () => {
    const scratch = seeded();
    write(scratch, PACKAGE, '{"version":"0.3.0"}\n');
    write(scratch, NOTES, notes('## 0.3.0\n\nReworded in the release commit.', RELEASED));
    stage(scratch, PACKAGE, NOTES);

    expect(judged(scratch)).toEqual([]);
  });

  describe('as pure functions', () => {
    test('sections are keyed by version and carry their text', () => {
      const sections = releaseSections(notes(NEXT, RELEASED));

      expect([...sections.keys()]).toEqual(['0.3.0', '0.2.0']);
      expect(sections.get('0.2.0')).toContain('Shipped in the second release.');
    });

    test('versions compare by number, not by text', () => {
      expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
      expect(compareVersions('0.2.0', '0.2.0')).toBe(0);
      expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0);
    });

    test('a section at the released version is protected and one above it is not', () => {
      const before = notes(NEXT, RELEASED);

      expect(ruleNames(scanReleasedSections(NOTES, before, notes(NEXT, '## 0.2.0\n\nEdited.'), '0.2.0'))).toEqual([
        'release-notes.released-entry-edited',
      ]);
      expect(scanReleasedSections(NOTES, before, notes('## 0.3.0\n\nEdited.', RELEASED), '0.2.0')).toEqual([]);
    });
  });
});

describe('the ratchet', () => {
  const counts = (n: Record<string, number>) => (prefix: string) => n[prefix] ?? 0;

  test('a count equal to the record is accepted', () => {
    expect(checkRatchet(BASELINE, counts({ 'apps/orm/tests/unit': 2 }))).toEqual([]);
  });

  test('a count above the record is refused', () => {
    const found = checkRatchet(BASELINE, counts({ 'apps/orm/tests/unit': 3 }));

    expect(ruleNames(found)).toEqual(['ratchet.count-above-baseline']);
    expect(found[0]?.where).toBe('apps/orm/tests/unit');
    expect(found[0]?.line).toContain('3');
    expect(found[0]?.line).toContain('2');
  });

  test('a count below the record is refused, so a saving cannot be spent twice', () => {
    const found = checkRatchet(BASELINE, counts({ 'apps/orm/tests/unit': 1 }));

    expect(ruleNames(found)).toEqual(['ratchet.baseline-stale']);
    expect(found[0]?.where).toBe('apps/orm/tests/unit');
  });

  test('a baseline raised in the index is refused and one lowered or unchanged is accepted', () => {
    const at = (n: number): Baseline => ({ 'as-any': { 'apps/orm/tests/unit': n } });

    expect(ruleNames(scanBaselineRaised(at(2), at(3)))).toEqual(['ratchet.baseline-raised']);
    expect(scanBaselineRaised(at(2), at(2))).toEqual([]);
    expect(scanBaselineRaised(at(2), at(1))).toEqual([]);
  });

  test('a new prefix added to the baseline is not a raise', () => {
    expect(scanBaselineRaised(BASELINE, { 'as-any': { 'apps/orm/tests/unit': 2, 'apps/orm/src': 9 } })).toEqual([]);
  });

  test('a staged baseline edited upwards is refused by the commit gate', () => {
    const scratch = newScratch();
    const path = 'tooling/hooks/baseline.json';
    seed(scratch, { [path]: '{"as-any":{"apps/orm/tests/unit":2}}\n' });
    write(scratch, path, '{"as-any":{"apps/orm/tests/unit":3}}\n');
    stage(scratch, path);

    expect(ruleNames(stagedRefusals(scratch))).toContain('ratchet.baseline-raised');
  });

  test('a staged baseline edited downwards is not a raise', () => {
    const scratch = newScratch();
    const path = 'tooling/hooks/baseline.json';
    seed(scratch, { [path]: '{"as-any":{"apps/orm/tests/unit":2}}\n' });
    write(scratch, path, '{"as-any":{"apps/orm/tests/unit":1}}\n');
    stage(scratch, path);

    expect(ruleNames(stagedRefusals(scratch))).not.toContain('ratchet.baseline-raised');
  });
});

describe('source that cannot be read as text', () => {
  test('a source file holding a NUL byte is refused rather than skipped', () => {
    const scratch = newScratch();
    write(scratch, 'apps/orm/src/a.ts', 'export const a = "\0";\n');
    stage(scratch, 'apps/orm/src/a.ts');

    expect(judged(scratch)).toEqual(['scan.unreadable-source']);
  });

  test('a binary file that is not source is left alone', () => {
    const scratch = newScratch();
    write(scratch, 'assets/logo.png', '\0\0\0');
    stage(scratch, 'assets/logo.png');

    expect(judged(scratch)).toEqual([]);
  });
});

describe('the added lines of a diff', () => {
  test('a hunk with a count adds that many lines from its start', () => {
    expect(parseAddedLines('@@ -1,0 +2,3 @@\n+a\n+b\n+c\n')).toEqual([2, 3, 4]);
  });

  test('a hunk with no count adds one line', () => {
    expect(parseAddedLines('@@ -4 +5 @@\n-x\n+y\n')).toEqual([5]);
  });

  test('a pure deletion adds nothing', () => {
    expect(parseAddedLines('@@ -4,2 +3,0 @@\n-x\n-y\n')).toEqual([]);
  });

  test('several hunks are joined', () => {
    expect(parseAddedLines('@@ -1 +1 @@\n@@ -9,0 +10,2 @@\n')).toEqual([1, 10, 11]);
  });
});

guardRepositoryConfiguration();
