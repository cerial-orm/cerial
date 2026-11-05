// The whole-file scans: planning identifiers, stub markers, unexplained suppressions
// and schema setup in an end-to-end file. Rules are named by identifier.

import { describe, expect, test } from 'bun:test';
import { E2E_SETUP_PATTERNS, STUB_PATTERNS, TRACKER_PATTERNS } from './patterns.ts';
import { isSourcePath, scanE2eSetup, scanStubs, scanSuppressions, scanTracker } from './scan.ts';
import { guardRepositoryConfiguration, STUB_FIXTURES, TOMB, TRACKER_FIXTURES } from './test-support.ts';

const SHIPPING = 'apps/orm/src/query/thing.ts';
const rules = (refusals: readonly { rule: string }[]): string[] => refusals.map((refusal) => refusal.rule);
const join = (...pieces: string[]): string => pieces.join('');

describe('planning identifiers', () => {
  test('there is a fixture for every pattern and for nothing else', () => {
    expect(Object.keys(TRACKER_FIXTURES).sort()).toEqual(TRACKER_PATTERNS.map((pattern) => pattern.rule).sort());
  });

  for (const [rule, fixture] of Object.entries(TRACKER_FIXTURES)) {
    test(`${rule} refuses its line`, () => {
      expect(rules(scanTracker(SHIPPING, fixture.refused))).toEqual([rule]);
    });

    test(`${rule} lets its near miss through`, () => {
      expect(scanTracker(SHIPPING, fixture.passes)).toEqual([]);
    });
  }

  test('every file is in scope, documentation and tests included', () => {
    const line = TRACKER_FIXTURES['tracker.plan-item']?.refused as string;

    for (const path of [
      'README.md',
      'apps/orm/tests/unit/a.test.ts',
      'apps/docs/content/docs/a.mdx',
      '.github/ci.yml',
    ]) {
      expect(rules(scanTracker(path, line))).toEqual(['tracker.plan-item']);
    }
  });

  test('documentation and other text files are read by the tree scan', () => {
    const line = TRACKER_FIXTURES['tracker.plan-item']?.refused as string;

    for (const path of ['a.mdx', 'a.html', 'a.sh', 'a.surql', 'a.cerial', 'a.txt']) {
      expect(isSourcePath(path)).toBe(true);
      expect(rules(scanTracker(`apps/docs/${path}`, line))).toEqual(['tracker.plan-item']);
    }
  });

  test('the planning tree itself is exempt', () => {
    const line = TRACKER_FIXTURES['tracker.plan-item']?.refused as string;

    expect(scanTracker(join('.o', 'mc/plans/a.md'), line)).toEqual([]);
  });

  test('the file whose job is to keep the planning tree out may name it, and only that', () => {
    const path = TRACKER_FIXTURES['tracker.planning-path']?.refused as string;
    const other = TRACKER_FIXTURES['tracker.plan-item']?.refused as string;

    expect(scanTracker('.gitignore', path)).toEqual([]);
    expect(rules(scanTracker('.gitignore', other))).toEqual(['tracker.plan-item']);
    expect(rules(scanTracker('apps/orm/.gitignore', path))).toEqual(['tracker.planning-path']);
  });

  test('a refusal carries the line number and the trimmed line', () => {
    const line = TRACKER_FIXTURES['tracker.plan-item']?.refused as string;
    const [found] = scanTracker(SHIPPING, `fine\n   ${line}   \nfine`);

    expect(found?.where).toBe(`${SHIPPING}:2`);
    expect(found?.line).toBe(line);
  });
});

describe('stub markers', () => {
  test('there is a fixture for every pattern and for nothing else', () => {
    expect(Object.keys(STUB_FIXTURES).sort()).toEqual(STUB_PATTERNS.map((pattern) => pattern.rule).sort());
  });

  for (const [rule, fixture] of Object.entries(STUB_FIXTURES)) {
    test(`${rule} refuses its line`, () => {
      expect(rules(scanStubs(SHIPPING, fixture.refused))).toEqual([rule]);
    });

    test(`${rule} lets its near miss through`, () => {
      expect(scanStubs(SHIPPING, fixture.passes)).toEqual([]);
    });
  }

  test.each(['apps/orm/src/a.ts', 'apps/orm/bin/a.ts', 'apps/vscode-extension/server/src/a.ts', 'tooling/hooks/a.ts'])(
    'a shipping path, %s, is read',
    (path) => {
      expect(rules(scanStubs(path, STUB_FIXTURES['stub.fix-it-later']?.refused as string))).toEqual([
        'stub.fix-it-later',
      ]);
    },
  );

  test.each([
    'apps/orm/tests/unit/a.test.ts',
    'apps/orm/tests/e2e/fixtures/a.ts',
    'apps/orm/src/a.spec.ts',
    'apps/docs/content/docs/a.mdx',
    'README.md',
    join('.o', 'mc/plans/a.md'),
  ])('a path that does not ship or is a test, %s, is left alone', (path) => {
    expect(scanStubs(path, STUB_FIXTURES['stub.fix-it-later']?.refused as string)).toEqual([]);
  });

  describe('the tombstone', () => {
    const reason = 'the engine has no move verb, so a move would be a copy';

    test('a tombstone with a reason of enough characters exempts its line, even from a marker', () => {
      const marker = join('t', 'odo');

      expect(scanStubs(SHIPPING, `// ${TOMB}: ${reason}, a ${marker} in all but name`)).toEqual([]);
    });

    test('a bare tombstone marker is refused', () => {
      expect(rules(scanStubs(SHIPPING, `// ${TOMB}`))).toEqual(['stub.tombstone-without-a-reason']);
    });

    test('a tombstone whose reason is too short is refused', () => {
      expect(rules(scanStubs(SHIPPING, `// ${TOMB}: later`))).toEqual(['stub.tombstone-without-a-reason']);
    });

    test('a reason of exactly the minimum is accepted and one short is refused', () => {
      expect(scanStubs(SHIPPING, `// ${TOMB}: ${'a'.repeat(20)}`)).toEqual([]);
      expect(rules(scanStubs(SHIPPING, `// ${TOMB}: ${'a'.repeat(19)}`))).toEqual(['stub.tombstone-without-a-reason']);
    });
  });
});

describe('lint suppressions', () => {
  const marker = join('oxlin', 't-disable');
  const PATH = 'apps/orm/src/a.ts';
  const RULE = 'typescript/no-empty-object-type';

  test('a block directive with the reason on the next line is accepted', () => {
    expect(
      scanSuppressions(PATH, `/* ${marker} ${RULE} */\n// {} is the empty intersection here\nexport type A = {};`),
    ).toEqual([]);
  });

  test('a next-line directive with the reason after a double dash is accepted', () => {
    expect(scanSuppressions(PATH, `// ${marker}-next-line ${RULE} -- {} is the empty intersection here`)).toEqual([]);
  });

  test.each([`// ${marker}`, `/* ${marker} */`, `// ${marker}-next-line`, `/* ${marker}-line */`])(
    '%s names no rule and is refused',
    (line) => {
      expect(rules(scanSuppressions(PATH, `${line}\n// a perfectly good reason`))).toEqual(['suppression.bare']);
    },
  );

  test.each([
    ['no line follows', `/* ${marker} ${RULE} */`],
    ['the next line is code', `/* ${marker} ${RULE} */\nexport type A = {};`],
    ['the next line is blank', `/* ${marker} ${RULE} */\n\nexport type A = {};`],
    ['the next line is a comment too short to be a reason', `/* ${marker} ${RULE} */\n// ok\nexport type A = {};`],
    ['the next line is another directive', `/* ${marker} ${RULE} */\n/* ${marker} ${RULE} */`],
    ['the double dash has no text after it', `// ${marker}-next-line ${RULE} --`],
    ['the double dash reason is too short', `// ${marker}-next-line ${RULE} -- ok`],
  ])('a directive is refused when %s', (_case, content) => {
    expect(rules(scanSuppressions(PATH, content))).toContain('suppression.bare');
  });

  test('re-enabling a rule needs no reason', () => {
    expect(scanSuppressions(PATH, `/* ${join('oxlin', 't-enable')} ${RULE} */`)).toEqual([]);
  });

  test('a path that is not code is not read', () => {
    expect(scanSuppressions('README.md', `// ${marker}`)).toEqual([]);
  });

  test('the line number of the hit is reported', () => {
    const [found] = scanSuppressions(PATH, `a\nb\n// ${marker} ${RULE}\nd`);

    expect(found?.where).toBe('apps/orm/src/a.ts:3');
  });
});

describe('schema setup in an end-to-end file', () => {
  const FILE = 'apps/orm/tests/e2e/users/create.test.ts';
  const fixtures: Record<string, { refused: string; passes: string }> = {
    'e2e-setup.remove-table': {
      refused: "await client.query('REMOVE TABLE user');",
      passes: "await client.query('DELETE FROM user');",
    },
    'e2e-setup.reset-migration-state': {
      refused: 'resetMigrationState();',
      passes: 'const kept = resetMigrationState;',
    },
    'e2e-setup.migrate': { refused: 'await client.migrate();', passes: 'await client.migration();' },
  };

  test('there is a fixture for every pattern and for nothing else', () => {
    expect(Object.keys(fixtures).sort()).toEqual(E2E_SETUP_PATTERNS.map((pattern) => pattern.rule).sort());
  });

  for (const [rule, fixture] of Object.entries(fixtures)) {
    test(`${rule} refuses its line`, () => {
      expect(rules(scanE2eSetup(FILE, fixture.refused))).toEqual([rule]);
    });

    test(`${rule} lets its near miss through`, () => {
      expect(scanE2eSetup(FILE, fixture.passes)).toEqual([]);
    });
  }

  test('the statement is matched in any case', () => {
    expect(rules(scanE2eSetup(FILE, 'remove   table user'))).toEqual(['e2e-setup.remove-table']);
  });

  test.each([
    'apps/orm/tests/e2e/preload.ts',
    'apps/orm/tests/e2e/test-helper.ts',
    'apps/orm/tests/e2e/generated/client.ts',
    'apps/orm/tests/e2e/typechecks/mixed/generated/client.ts',
    'apps/orm/tests/e2e/schemas/a.cerial',
    'apps/orm/tests/unit/a.test.ts',
    'apps/orm/src/a.ts',
  ])('%s is not an end-to-end spec and is left alone', (path) => {
    expect(scanE2eSetup(path, 'await client.migrate();')).toEqual([]);
  });

  test.each(['graph-edges', 'vector-indexes', 'time-series', 'live-queries'])(
    'the raw surface spec %s may remove its own table',
    (name) => {
      const path = `apps/orm/tests/e2e/raw/surfaces/${name}.test.ts`;

      expect(scanE2eSetup(path, "await client.query('REMOVE TABLE rawsf_a');")).toEqual([]);
    },
  );

  test('other raw specs and unlisted surface files are still refused', () => {
    for (const path of ['apps/orm/tests/e2e/raw/filter.test.ts', 'apps/orm/tests/e2e/raw/surfaces/other.test.ts']) {
      expect(rules(scanE2eSetup(path, "await client.query('REMOVE TABLE rawsf_a');"))).toEqual([
        'e2e-setup.remove-table',
      ]);
    }
  });

  test('only the lines the caller names are read', () => {
    const content = 'await client.migrate();\nfine;\nawait client.migrate();';

    expect(scanE2eSetup(FILE, content, new Set([3])).map((found) => found.where)).toEqual([`${FILE}:3`]);
    expect(scanE2eSetup(FILE, content, new Set())).toEqual([]);
  });
});

guardRepositoryConfiguration();
