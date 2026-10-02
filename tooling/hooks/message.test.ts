// The message gate. Rules are named by their identifier, never by the label or the
// sentence a refusal prints.

import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  BODY_WRAP,
  COMMIT_SCOPES,
  COMMIT_TYPES,
  checkMessage,
  looksImperative,
  MESSAGE_GATES,
  parseSubject,
  SHAPE_RULES,
  SUBJECT_MAX,
} from './message.ts';
import { TRACKER_PATTERNS } from './patterns.ts';
import {
  commit,
  guardRepositoryConfiguration,
  HOOKS_DIR,
  messageRefusals,
  newScratch,
  removeScratchesAfterAll,
  ruleNames,
  seed,
  stage,
  TRACKER_FIXTURES,
  write,
} from './test-support.ts';

removeScratchesAfterAll();

const BODY = 'Explains what changed in the code.\nExplains why it had to change.';
const noVersion = (): string | null => null;
const rulesOf = (raw: string, versionOf: (scope: string) => string | null = noVersion): string[] =>
  ruleNames(checkMessage(raw, versionOf));
const withBody = (subject: string, body: string = BODY): string => `${subject}\n\n${body}\n`;
const dot = (...pieces: string[]): string => pieces.join('');

describe('a well-formed message', () => {
  test('feat with a scope and a two-sentence body is accepted', () => {
    expect(rulesOf(withBody('feat(orm): add typed ids'))).toEqual([]);
  });

  test('comment lines and the verbose diff below the scissors line are not part of the message', () => {
    const raw = `${withBody('fix(orm): reject operator values')}# Please enter a message\n# ------------------------ >8 ------------------------\ndiff --git a b\n+ the scans are green`;

    expect(rulesOf(raw)).toEqual([]);
  });

  test('merge and revert subjects written by git are held to no shape', () => {
    expect(rulesOf('Merge branch dev into ci-hardening')).toEqual([]);
    expect(rulesOf('Revert "feat(orm): add typed ids"')).toEqual([]);
  });
});

describe('type', () => {
  test.each(COMMIT_TYPES.map((type) => [type]))('%s is accepted', (type) => {
    expect(rulesOf(withBody(`${type}: add the thing`))).toEqual([]);
  });

  test.each(['feature', 'wip', 'misc'])('%s is refused as an unknown type', (type) => {
    expect(rulesOf(withBody(`${type}(orm): add the thing`))).toEqual([SHAPE_RULES.typeUnknown]);
  });

  test('a capitalised type is not conventional at all', () => {
    expect(rulesOf(withBody('Feat(orm): add the thing'))).toEqual([SHAPE_RULES.subjectNotConventional]);
  });
});

describe('scope', () => {
  test.each(COMMIT_SCOPES.map((scope) => [scope]))('%s is accepted', (scope) => {
    expect(rulesOf(withBody(`feat(${scope}): add the thing`))).toEqual([]);
  });

  test('no scope is accepted', () => {
    expect(rulesOf(withBody('feat: add the thing'))).toEqual([]);
  });

  test('a scope outside the list is refused', () => {
    expect(rulesOf(withBody('feat(cli): add the thing'))).toEqual([SHAPE_RULES.scopeUnknown]);
  });
});

describe('subject shape', () => {
  test('an empty message has no subject', () => {
    expect(rulesOf('')).toEqual([SHAPE_RULES.subjectMissing]);
    expect(rulesOf('# only a comment\n')).toEqual([SHAPE_RULES.subjectMissing]);
  });

  test('a subject of exactly the limit is accepted and one character over is refused', () => {
    const description = (length: number): string => `feat(orm): ${'a'.repeat(length - 'feat(orm): '.length)}`;

    expect(rulesOf(withBody(description(SUBJECT_MAX)))).toEqual([]);
    expect(rulesOf(withBody(description(SUBJECT_MAX + 1)))).toEqual([SHAPE_RULES.subjectTooLong]);
  });

  test('a trailing period is refused', () => {
    expect(rulesOf(withBody('feat(orm): add typed ids.'))).toEqual([SHAPE_RULES.subjectTrailingPeriod]);
  });

  test.each([
    'add typed ids',
    'feat add typed ids',
    'feat(orm):add typed ids',
    'feat(): add typed ids',
  ])('%s is not conventional', (subject) => {
    expect(rulesOf(withBody(subject))).toEqual([SHAPE_RULES.subjectNotConventional]);
  });
});

describe('imperative mood is read from the description, not the subject', () => {
  test('feat(orm): add typed ids is accepted', () => {
    expect(rulesOf(withBody('feat(orm): add typed ids'))).toEqual([]);
  });

  test('feat(orm): added typed ids is refused', () => {
    expect(rulesOf(withBody('feat(orm): added typed ids'))).toEqual([SHAPE_RULES.subjectNotImperative]);
  });

  test('the type and scope are not the word that is judged', () => {
    expect(parseSubject('feat(orm): added typed ids')?.description).toBe('added typed ids');
    // The adaptation this pins: reading the whole subject sees "featorm", which carries
    // no telltale ending and passes whatever verb follows it.
    expect(looksImperative('feat(orm): added typed ids')).toBe(true);
    expect(looksImperative('added typed ids')).toBe(false);
  });

  test.each([
    'fix(orm): fixed the join',
    'fix(orm): fixes the join',
    'fix(orm): fixing the join',
  ])('%s is refused', (subject) => {
    expect(rulesOf(withBody(subject))).toEqual([SHAPE_RULES.subjectNotImperative]);
  });

  test.each(['add', 'reject', 'pass', 'focus', 'read', 'need', 'bring', 'Add'])('the verb %s is accepted', (verb) => {
    expect(rulesOf(withBody(`fix(orm): ${verb} the registry`))).toEqual([]);
  });

  test('a description with no word in it is refused', () => {
    expect(rulesOf(withBody('fix(orm): 42'))).toEqual([SHAPE_RULES.subjectNotImperative]);
  });
});

describe('release subjects', () => {
  const declares = (version: string | null) => (scope: string) => (scope === 'orm' ? version : null);

  test('the version the package declares is accepted', () => {
    expect(rulesOf('chore(orm): release v0.3.0', declares('0.3.0'))).toEqual([]);
  });

  test('a version that disagrees with the package is refused', () => {
    expect(rulesOf('chore(orm): release v9.9.9', declares('0.3.0'))).toEqual([SHAPE_RULES.releaseVersion]);
  });

  test('a package with no readable version is refused', () => {
    expect(rulesOf('chore(orm): release v0.3.0', declares(null))).toEqual([SHAPE_RULES.releaseVersion]);
  });

  test.each([
    ['feat(orm): release v0.3.0', 'a type other than chore'],
    ['chore: release v0.3.0', 'no scope'],
    ['chore(docs): release v0.3.0', 'a scope with no package'],
    ['chore(orm): release v0.3', 'a version that is not three numbers'],
    ['chore(orm): release v0.3.0-rc.1', 'a pre-release suffix'],
  ])('%s is refused for the form (%s)', (subject) => {
    expect(rulesOf(withBody(subject), declares('0.3.0'))).toEqual([SHAPE_RULES.releaseForm]);
  });

  test('the version is read from the index of the repository the message is committed in', () => {
    const scratch = newScratch();
    seed(scratch, { 'apps/orm/package.json': '{"version":"0.2.0"}\n' });
    write(scratch, 'apps/orm/package.json', '{"version":"0.3.0"}\n');
    stage(scratch, 'apps/orm/package.json');

    expect(ruleNames(messageRefusals(scratch, 'chore(orm): release v0.3.0'))).toEqual([]);
    expect(ruleNames(messageRefusals(scratch, 'chore(orm): release v0.2.0'))).toEqual([SHAPE_RULES.releaseVersion]);
  });
});

describe('body', () => {
  test.each(['feat', 'fix', 'refactor', 'perf'])('%s with no body is refused', (type) => {
    expect(rulesOf(`${type}(orm): add the thing`)).toEqual([SHAPE_RULES.bodyMissing]);
  });

  test.each(['feat', 'fix', 'refactor', 'perf'])('%s with one finished sentence is refused', (type) => {
    expect(rulesOf(withBody(`${type}(orm): add the thing`, 'Only one sentence here.'))).toEqual([
      SHAPE_RULES.bodyTooFewSentences,
    ]);
  });

  test.each(['feat', 'fix', 'refactor', 'perf'])('%s with two finished sentences is accepted', (type) => {
    expect(rulesOf(withBody(`${type}(orm): add the thing`, 'One sentence here. And a second one.'))).toEqual([]);
  });

  test('sentences are counted by their terminators, not by lines', () => {
    expect(rulesOf(withBody('fix(orm): add the thing', 'Two lines but no terminator\nand still none'))).toEqual([
      SHAPE_RULES.bodyTooFewSentences,
    ]);
  });

  test.each(['docs', 'test', 'chore', 'build', 'ci', 'style'])('%s may stand on its subject alone', (type) => {
    expect(rulesOf(`${type}(orm): add the thing`)).toEqual([]);
  });

  test('a body must be separated from the subject by a blank line', () => {
    expect(rulesOf(`docs(orm): add the thing\n${BODY}`)).toEqual([SHAPE_RULES.bodyNotSeparated]);
  });

  test('a body line of exactly the wrap is accepted and one over is refused', () => {
    const line = (length: number): string => `${'word '.repeat(Math.ceil(length / 5)).slice(0, length - 1)}x`;
    const accepted = line(BODY_WRAP);
    const refused = line(BODY_WRAP + 1);

    expect(accepted.length).toBe(BODY_WRAP);
    expect(rulesOf(withBody('docs(orm): add the thing', accepted))).toEqual([]);
    expect(rulesOf(withBody('docs(orm): add the thing', refused))).toEqual([SHAPE_RULES.bodyLineTooLong]);
  });

  test('an unbroken token longer than the wrap, such as a URL, is accepted', () => {
    expect(rulesOf(withBody('docs(orm): add the thing', `https://example.com/${'a'.repeat(100)}`))).toEqual([]);
  });

  test('a long trailer line is accepted', () => {
    expect(rulesOf(withBody('docs(orm): add the thing', `Reviewed-by: ${'Somebody Long '.repeat(8)}`))).toEqual([]);
  });
});

/**
 * Every pattern in the message gate has a line it refuses and a near miss it
 * lets through. A rule added without an entry here fails the completeness test.
 */
const GATE_FIXTURES: Readonly<Record<string, { refused: string; passes: string }>> = {
  ...TRACKER_FIXTURES,
  'message.status-green': { refused: 'all tests green again', passes: 'paint the button green' },
  'message.status-all-pass': { refused: 'all the tests pass now', passes: 'pass the flag to the tests' },
  'message.status-ratio': { refused: 'finished 12/13 of them', passes: 'split input and output' },
  'message.status-count': { refused: 'then 40 tests pass', passes: 'add 40 tests for filters' },
  'message.status-measurement': { refused: 'coverage 90 on filters', passes: 'add a coverage report' },
  'message.status-percentage': { refused: 'reaches 90% coverage', passes: 'cover 90 cases of input' },
  'message.status-no-failures': { refused: 'no errors remain', passes: 'report errors to the caller' },
  'message.status-zero-failures': { refused: 'leaves 0 warnings', passes: 'warnings are listed' },
  'message.status-clean': { refused: 'the lint is clean now', passes: 'clean up the build output' },
  'message.process-ran-a-check': { refused: 'ran the audit again', passes: 'run commands in order' },
  'message.process-a-named-pass': { refused: 'a cleanup pass over the files', passes: 'pass the cleanup flag' },
  'message.process-after-an-activity': { refused: 'done after a refactor', passes: 'done after the release' },
  'message.process-part-of-an-activity': { refused: 'as part of a cleanup', passes: 'as part of the release' },
  'message.defensive-no-behaviour-change': { refused: 'there is no behaviour change', passes: 'a behaviour change' },
  'message.defensive-behaviour-unchanged': { refused: 'behaviour is unchanged', passes: 'behaviour differs' },
  'message.defensive-changes-no-behaviour': { refused: 'does not change behaviour', passes: 'does change behaviour' },
  'message.defensive-purely-cosmetic': { refused: 'purely cosmetic edit', passes: 'a cosmetic edit' },
  'message.defensive-cosmetic-only': { refused: 'cosmetic only edit', passes: 'cosmetic rules apply' },
  'message.defensive-one-kind-only': { refused: 'rename only edit', passes: 'rename the field' },
  'message.defensive-just-a-rename': { refused: 'just a rename of x', passes: 'a rename of x' },
  'message.defensive-nothing-changed': { refused: 'nothing changed there', passes: 'a thing changed there' },
  'message.defensive-should-be-safe': { refused: 'should be safe to merge', passes: 'should be reviewed first' },
  'message.defensive-non-functional': { refused: 'a non-functional change', passes: 'a functional change' },
  'message.attribution-vendor': { refused: 'thanks to Claude for it', passes: 'thanks to the maintainers' },
  'message.attribution-generated-with': { refused: 'generated with a tool', passes: 'the generated client' },
  'message.attribution-co-author-trailer': {
    refused: 'Co-authored-by: ci-bot <ci-bot@example.com>',
    passes: 'Co-authored-by: Jane Doe <jane@example.com>',
  },
  'message.attribution-session-trailer': { refused: 'Session-Id: abc123', passes: 'Reviewed-by: Jane Doe' },
  'message.attribution-asked-a-model': { refused: 'asked an agent to do it', passes: 'asked the maintainer to do it' },
  'message.attribution-written-by-a-model': { refused: 'written by an ai', passes: 'written by hand' },
  'message.attribution-ai-generated': { refused: 'an AI-generated patch', passes: 'a generated patch' },
  'message.attribution-with-help-of-a-model': {
    refused: 'with the help of an assistant',
    passes: 'with the help of the docs',
  },
  'message.attribution-prompted-a-model': { refused: 'prompted the model twice', passes: 'prompt the user twice' },
};

describe('every refused shape, one line at a time', () => {
  const inBody = (line: string): string => `docs: add the thing\n\n${line}\nA second line of prose.\n`;

  test('there is a fixture for every pattern in the gate and for nothing else', () => {
    expect(Object.keys(GATE_FIXTURES).sort()).toEqual(MESSAGE_GATES.map((gate) => gate.rule).sort());
  });

  test('the tracker patterns in the gate are the tree scan own', () => {
    for (const pattern of TRACKER_PATTERNS) expect(MESSAGE_GATES).toContain(pattern);
  });

  for (const [rule, fixture] of Object.entries(GATE_FIXTURES)) {
    test(`${rule} refuses its line`, () => {
      const found = checkMessage(inBody(fixture.refused), noVersion).filter((r) => r.where === 'message:3');

      expect(found.map((r) => r.rule)).toEqual([rule]);
    });

    test(`${rule} lets its near miss through`, () => {
      expect(rulesOf(inBody(fixture.passes))).toEqual([]);
    });
  }

  test('a hit in the subject is refused as well as one in the body', () => {
    const found = checkMessage(withBody('docs: add the thing after a refactor'), noVersion);

    expect(found.map((r) => [r.rule, r.where])).toEqual([['message.process-after-an-activity', 'message:1']]);
  });

  test('every hit is reported, one per offending line', () => {
    const raw = withBody('docs: add the thing', 'ran the audit\nno errors remain\nAnd a clean line.');

    expect(rulesOf(raw)).toEqual(['message.process-ran-a-check', 'message.status-no-failures']);
  });
});

describe('attribution and planning paths', () => {
  const attribution = [
    'Co-Authored-By: Claude <noreply@anthropic.com>',
    'Co-authored-by: Dev Assistant <dev@example.com>',
    `${dot('Gener', 'ated with')} a coding tool`,
    'Session-Id: 0a1b2c',
    'written with Copilot',
    'checked by ChatGPT',
  ];

  test.each(attribution)('%s is refused in a message', (line) => {
    const found = rulesOf(withBody('docs: add the thing', `Body line one.\n${line}\nBody line three.`));

    expect(found.length).toBeGreaterThanOrEqual(1);
    for (const rule of found) expect(rule).toMatch(/^message\.attribution-/);
  });

  test('crediting a person in a trailer is accepted', () => {
    expect(
      rulesOf(withBody('docs: add the thing', 'Body line one.\nCo-authored-by: Jane Doe <jane@example.com>')),
    ).toEqual([]);
  });

  test('a path into the planning tree is refused in the subject and in the body', () => {
    const path = dot('.o', 'mc/plans/x.md');

    expect(rulesOf(withBody(`docs: note ${path}`))).toEqual(['tracker.planning-path']);
    expect(rulesOf(withBody('docs: add the thing', `Body line one.\nSee ${path} for more.`))).toEqual([
      'tracker.planning-path',
    ]);
  });

  test('a bare mention of the plugin with no path is accepted', () => {
    expect(rulesOf(withBody('docs: add the thing', 'Body line one.\nThe omc plugin reads it.'))).toEqual([]);
  });
});

describe('the commit-msg hook', () => {
  function runHook(raw: string, cwd: string, env: Record<string, string>): number {
    const scratch = spawnSync(process.execPath, ['-e', `await Bun.write('msg', ${JSON.stringify(raw)})`], { cwd, env });
    expect(scratch.status).toBe(0);
    const run = spawnSync(process.execPath, [join(HOOKS_DIR, 'commit-msg'), 'msg'], { cwd, env, encoding: 'utf8' });

    return run.status ?? -1;
  }

  test('exits 0 for a message the gate accepts and 1 for one it refuses', () => {
    const scratch = newScratch();

    expect(runHook(withBody('feat(orm): add typed ids'), scratch.dir, scratch.env)).toBe(0);
    expect(runHook(withBody('feat(orm): added typed ids'), scratch.dir, scratch.env)).toBe(1);
  });

  test('exits 1 when no message file is given', () => {
    const scratch = newScratch();
    const run = spawnSync(process.execPath, [join(HOOKS_DIR, 'commit-msg')], { cwd: scratch.dir, env: scratch.env });

    expect(run.status).toBe(1);
  });

  test('git itself aborts the commit when the hook exits non-zero', () => {
    const scratch = newScratch();
    write(scratch, 'a.txt', 'a\n');
    stage(scratch, 'a.txt');
    commit(scratch, 'chore: seed');
    write(scratch, 'b.txt', 'b\n');
    stage(scratch, 'b.txt');
    const refused = scratch.git(
      '-c',
      `core.hooksPath=${HOOKS_DIR}`,
      '-c',
      'user.name=Suite',
      '-c',
      'user.email=suite@example.com',
      'commit',
      '-m',
      'added things',
    );

    expect(refused.status).not.toBe(0);
    expect(scratch.git('rev-list', '--count', 'HEAD').stdout.trim()).toBe('1');
  });
});

guardRepositoryConfiguration();
