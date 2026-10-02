// The foundation of the hook suite: that it cannot touch this repository, that the
// pattern source does not refuse itself, and that rule identifiers are unique.

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SHAPE_RULES } from './message.ts';
import { AS_ANY, E2E_SETUP_PATTERNS, STUB_PATTERNS, SUPPRESSION, TRACKER_PATTERNS } from './patterns.ts';
import { type StagedFile, scanFiles } from './scan.ts';
import { scratchRepository, withoutGit } from './scratch.ts';
import {
  guardRepositoryConfiguration,
  HOOKS_DIR,
  newScratch,
  removeScratchesAfterAll,
  sameDirectory,
} from './test-support.ts';
import { runVerify, type VerifyParts, verifySteps } from './verify.ts';

removeScratchesAfterAll();

describe('git environment isolation', () => {
  test('withoutGit drops every variable carrying the git prefix and keeps the rest', () => {
    const cleaned = withoutGit({
      GIT_DIR: '/elsewhere',
      GIT_INDEX_FILE: '/elsewhere/index',
      GIT_WORK_TREE: '/elsewhere',
      GIT_A_VARIABLE_GIT_ADDS_LATER: '1',
      PATH: '/bin',
      HOME: '/home/x',
      NOT_GIT_X: 'kept',
      EMPTY: undefined,
    });

    expect(cleaned).toEqual({ PATH: '/bin', HOME: '/home/x', NOT_GIT_X: 'kept' });
    expect(Object.isFrozen(cleaned)).toBe(true);
  });

  test('a scratch repository ignores a git directory leaked through the environment', () => {
    const decoy = mkdtempSync(join(tmpdir(), 'cerial-decoy-'));
    const saved = { GIT_DIR: process.env.GIT_DIR, GIT_WORK_TREE: process.env.GIT_WORK_TREE };
    process.env.GIT_DIR = join(decoy, '.git');
    process.env.GIT_WORK_TREE = decoy;
    try {
      const scratch = newScratch();
      const top = scratch.git('rev-parse', '--show-toplevel');

      expect(Object.keys(scratch.env).filter((name) => name.startsWith('GIT_'))).toEqual([]);
      expect(sameDirectory(top.stdout.trim(), scratch.dir)).toBe(true);
      expect(readdirSync(decoy)).toEqual([]);
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  test('each scratch repository is its own directory', () => {
    const first = newScratch();
    const second = scratchRepository('cerial-hooks-other-');

    expect(first.dir).not.toBe(second.dir);
  });
});

describe('the pattern source does not refuse itself', () => {
  const names = readdirSync(HOOKS_DIR);

  test('the directory is read, so the next test cannot pass over nothing', () => {
    expect(names).toContain('patterns.ts');
    expect(names).toContain('message.ts');
    expect(names.length).toBeGreaterThanOrEqual(13);
  });

  test('every file in the hook directory passes every file scan', () => {
    const files: StagedFile[] = names.map((name) => ({
      path: `tooling/hooks/${name}`,
      content: readFileSync(join(HOOKS_DIR, name), 'utf8'),
    }));

    expect(scanFiles(files)).toEqual([]);
  });
});

describe('rule identifiers', () => {
  const sources = ['patterns.ts', 'message.ts', 'scan.ts', 'repo-scans.ts'].map((name) =>
    readFileSync(join(HOOKS_DIR, name), 'utf8'),
  );
  const declared = sources.flatMap((source) => [
    ...[...source.matchAll(/\brule: '([a-z][a-z0-9.-]*)'/g)].map((m) => m[1] as string),
    ...[...source.matchAll(/\brefusal\(\s*'([a-z][a-z0-9.-]*)'/g)].map((m) => m[1] as string),
    ...[...source.matchAll(/: '(shape\.[a-z-]+)',/g)].map((m) => m[1] as string),
  ]);

  test('the sources are read, so the checks below are not vacuous', () => {
    expect(declared.length).toBeGreaterThan(50);
    expect(declared).toContain('shape.subject-not-imperative');
    expect(declared).toContain('paths.ignored');
    expect(declared).toContain('ratchet.baseline-raised');
  });

  test('no two rules share an identifier', () => {
    const repeated = declared.filter((rule, index) => declared.indexOf(rule) !== index);

    expect(repeated).toEqual([]);
  });

  test('every identifier is a gate-family prefix, a dot and a kebab-case name', () => {
    for (const rule of declared) expect(rule).toMatch(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.[a-z][a-z0-9-]*$/);
  });

  test('the exported pattern lists agree with the sources', () => {
    const exported = [...TRACKER_PATTERNS, ...STUB_PATTERNS, ...E2E_SETUP_PATTERNS, AS_ANY, SUPPRESSION].map(
      (pattern) => pattern.rule,
    );
    const shape = Object.values(SHAPE_RULES);

    for (const rule of [...exported, ...shape]) expect(declared).toContain(rule);
    expect(new Set(exported).size).toBe(exported.length);
  });
});

describe('verify', () => {
  function fake(exitCodes: (number | null)[]): {
    parts: VerifyParts;
    calls: { command: string[]; env: Record<string, string>; cwd: string }[];
  } {
    const calls: { command: string[]; env: Record<string, string>; cwd: string }[] = [];
    const parts: VerifyParts = {
      env: { GIT_DIR: '/real/.git', GIT_INDEX_FILE: '/real/.git/index', PATH: '/bin', HOME: '/home/x' },
      paths: () => ['a.ts'],
      spawn: (command, options) => {
        calls.push({ command, env: options.env, cwd: options.cwd });

        const index = calls.length - 1;

        return { exitCode: index < exitCodes.length ? (exitCodes[index] as number | null) : 0 };
      },
    };

    return { parts, calls };
  }

  test('every step runs with no git variable and with the rest of the environment', () => {
    const { parts, calls } = fake([]);
    const result = runVerify(parts);

    expect(result.ok).toBe(true);
    expect(calls.length).toBe(verifySteps([]).length);
    for (const call of calls) {
      expect(Object.keys(call.env).filter((name) => name.startsWith('GIT_'))).toEqual([]);
      expect(call.env.PATH).toBe('/bin');
    }
  });

  test('stops at the first step that fails', () => {
    const { parts, calls } = fake([1]);

    expect(runVerify(parts).ok).toBe(false);
    expect(calls.length).toBe(1);
  });

  test('a step that could not run counts as a failed step', () => {
    const { parts } = fake([0, null]);

    expect(runVerify(parts).ok).toBe(false);
  });

  test('the staged paths reach the formatter check', () => {
    const [first] = verifySteps(['a.ts', 'b.ts'], 'bun');

    expect(first?.command.slice(-2)).toEqual(['a.ts', 'b.ts']);
  });

  test('no step starts a suite that needs a database or a second editor instance', () => {
    for (const step of verifySteps(['a.ts'])) {
      const text = step.command.join(' ');

      expect(text).not.toMatch(/integration|e2e|vscode-test/);
    }
  });

  test('the extension unit and grammar suites are part of the gate', () => {
    const extension = verifySteps([]).find((step) => step.cwd.endsWith('apps/vscode-extension'));

    expect(extension?.command).toContain('tests/unit');
    expect(extension?.command).toContain('tests/grammar');
  });
});

guardRepositoryConfiguration();
