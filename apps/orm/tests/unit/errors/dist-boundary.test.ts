/**
 * Unit tests: instanceof across the module boundary a real consumer crosses.
 *
 * A class duplicated by the bundler breaks `instanceof` with no error, and only across a boundary
 * like this one. These tests load the BUILT package, so they build it first when `dist/` is missing.
 * An existing `dist/` is used as it stands: run `bun run build` after changing `src/`, as the e2e
 * suite also requires.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { ERROR_CLASSES } from './helpers';

type ErrorsModule = typeof import('../../../src/errors');
type DistModule = ErrorsModule & Record<string, unknown>;
interface DistValidator {
  detectConfigsInsideRootPaths(rootPaths: string[], cwd: string): Promise<void>;
}

const root = resolve(import.meta.dir, '../../..');
const fixtures = resolve(import.meta.dir, '../../fixtures/config-merge');
const nestedConfig = resolve(fixtures, 'nested-config');
const require = createRequire(import.meta.url);

let dist: DistModule;
let cjs: DistModule;
// The thrower is a module of the built cli graph, a different entry from the package root.
let distValidator: DistValidator;

beforeAll(async () => {
  if (!existsSync(resolve(root, 'dist/index.mjs'))) {
    const build = Bun.spawnSync(['bun', 'run', 'build'], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
    if (build.exitCode !== 0) throw new Error(`bun run build failed:\n${build.stderr.toString()}`);
  }

  dist = (await import(resolve(root, 'dist/index.mjs'))) as DistModule;
  distValidator = (await import(resolve(root, 'dist/cli/config/validator.mjs'))) as DistValidator;
  cjs = require(resolve(root, 'dist/index.cjs')) as DistModule;
}, 120_000);

describe('the package entry', () => {
  test('exports every class and the code table', () => {
    for (const { name } of ERROR_CLASSES) expect(typeof dist[name]).toBe('function');
    expect(typeof dist.CerialError).toBe('function');
    expect(dist.CERIAL_ERROR_CODES.VALIDATION).toBe('C3000');
  });

  test('every subclass is an instance of the entry CerialError', () => {
    for (const { name, code } of ERROR_CLASSES) {
      const Ctor = dist[name] as new (message: string) => InstanceType<ErrorsModule['CerialError']>;
      const error = new Ctor('msg');

      expect(error instanceof dist.CerialError).toBe(true);
      expect(error.code).toBe(code);
    }
  });
});

describe('an error thrown inside one built entry and caught against another', () => {
  test('the cli graph throws a class the package entry recognises', async () => {
    const caught = await distValidator.detectConfigsInsideRootPaths([nestedConfig], fixtures).catch((e: unknown) => e);

    expect(caught).toBeInstanceOf(dist.CerialGenerationError);
    expect(caught).toBeInstanceOf(dist.CerialError);
    expect((caught as InstanceType<ErrorsModule['CerialError']>).code).toBe('C7000');
  });

  test('and is not mistaken for a sibling class', async () => {
    const caught = await distValidator.detectConfigsInsideRootPaths([nestedConfig], fixtures).catch((e: unknown) => e);

    expect(caught instanceof dist.CerialValidationError).toBe(false);
    expect(caught instanceof dist.CerialDatabaseError).toBe(false);
  });
});

describe('the CommonJS entry', () => {
  test('exports every class', () => {
    for (const { name } of ERROR_CLASSES) expect(typeof cjs[name]).toBe('function');
  });

  test('keeps instanceof working inside its own module graph', () => {
    const error = new cjs.CerialUniqueConstraintError('msg', { model: 'User' });

    expect(error instanceof cjs.CerialUniqueConstraintError).toBe(true);
    expect(error instanceof cjs.CerialError).toBe(true);
    expect(error instanceof cjs.CerialValidationError).toBe(false);
    expect(error.code).toBe('C6000');
  });
});
