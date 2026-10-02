// The whole-file scans: planning identifiers, stub markers, unexplained suppressions
// and schema setup in an end-to-end file. Rules are named by identifier.

import { describe, expect, test } from 'bun:test';
import { E2E_SETUP_PATTERNS, STUB_PATTERNS, TRACKER_PATTERNS } from './patterns.ts';
import { scanE2eSetup, scanStubs, scanSuppressions, scanTracker } from './scan.ts';
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

  test('the planning tree itself is exempt', () => {
    const line = TRACKER_FIXTURES['tracker.plan-item']?.refused as string;

    expect(scanTracker(join('.o', 'mc/plans/a.md'), line)).toEqual([]);
  });

  test('the two files whose job is to keep the planning tree out may name it, and only that', () => {
    const path = TRACKER_FIXTURES['tracker.planning-path']?.refused as string;
    const other = TRACKER_FIXTURES['tracker.plan-item']?.refused as string;

    expect(scanTracker('.gitignore', path)).toEqual([]);
    expect(scanTracker('biome.json', path)).toEqual([]);
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

  test.each([
    'apps/orm/src/a.ts',
    'apps/orm/bin/a.ts',
    'apps/vscode-extension/server/src/a.ts',
    'tooling/hooks/a.ts',
  ])('a shipping path, %s, is read', (path) => {
    expect(rules(scanStubs(path, STUB_FIXTURES['stub.fix-it-later']?.refused as string))).toEqual([
      'stub.fix-it-later',
    ]);
  });

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
  const marker = join('biome-ign', 'ore');

  test('a rule, a colon and a reason are accepted', () => {
    expect(
      scanSuppressions(
        'apps/orm/src/a.ts',
        `// ${marker} lint/suspicious/noExplicitAny: the registry holds every model`,
      ),
    ).toEqual([]);
  });

  test.each([
    `// ${marker}`,
    `// ${marker} lint/suspicious/noExplicitAny`,
    `// ${marker} lint/suspicious/noExplicitAny:`,
    `// ${marker} lint/suspicious/noExplicitAny: ok`,
  ])('%s is refused as unexplained', (line) => {
    expect(rules(scanSuppressions('apps/orm/src/a.ts', line))).toEqual(['suppression.bare']);
  });

  describe('the -all, -start and -end forms', () => {
    const forms = ['', '-all', '-start', '-end'];

    test.each(forms)('the %s form with a rule and a reason is accepted', (suffix) => {
      expect(
        scanSuppressions(
          'apps/orm/src/a.ts',
          `// ${marker}${suffix} lint/suspicious/noExplicitAny: the registry is untyped`,
        ),
      ).toEqual([]);
    });

    test.each(forms)('the %s form with no reason is refused', (suffix) => {
      for (const tail of ['', ' lint/suspicious/noExplicitAny', ' lint/suspicious/noExplicitAny: ok']) {
        expect(rules(scanSuppressions('apps/orm/src/a.ts', `// ${marker}${suffix}${tail}`))).toEqual([
          'suppression.bare',
        ]);
      }
    });
  });

  test('a path that is not code is not read', () => {
    expect(scanSuppressions('README.md', `// ${marker}`)).toEqual([]);
  });

  test('the line number of the hit is reported', () => {
    const [found] = scanSuppressions('apps/orm/src/a.ts', `a\nb\n// ${marker} lint/x\nd`);

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
    'apps/orm/tests/e2e/schemas/a.cerial',
    'apps/orm/tests/unit/a.test.ts',
    'apps/orm/src/a.ts',
  ])('%s is not an end-to-end spec and is left alone', (path) => {
    expect(scanE2eSetup(path, 'await client.migrate();')).toEqual([]);
  });

  test('only the lines the caller names are read', () => {
    const content = 'await client.migrate();\nfine;\nawait client.migrate();';

    expect(scanE2eSetup(FILE, content, new Set([3])).map((found) => found.where)).toEqual([`${FILE}:3`]);
    expect(scanE2eSetup(FILE, content, new Set())).toEqual([]);
  });
});

guardRepositoryConfiguration();
