/**
 * Declarations whose names differ only in case lowercase to one generated file name, so one type would
 * be overwritten. Generate refuses them and writes nothing.
 */

import { afterAll, describe, expect, it } from 'bun:test';
import { cleanupFixtures, generateFixture } from './helpers';

afterAll(cleanupFixtures);

const written = (output: string[]) => output.filter((f) => f !== '.cerial-output.json');

async function expectRefused(source: string, a: string, b: string): Promise<void> {
  const result = await generateFixture({ 'a.cerial': source });

  expect(result.exitCode).not.toBe(0);
  expect(result.stdout + result.stderr).toMatch(/differ only in case|Name collision/);
  expect(result.stdout + result.stderr).toContain(a);
  expect(result.stdout + result.stderr).toContain(b);
  expect(written(result.output)).toEqual([]);
}

describe('names that differ only in case', () => {
  it('refuses model Post and model POST', () =>
    expectRefused('model Post {\n  id Record @id\n}\nmodel POST {\n  id Record @id\n}\n', 'Post', 'POST'));

  it('refuses object Box and object BOX', () =>
    expectRefused('object Box {\n  a String\n}\nobject BOX {\n  a String\n}\n', 'Box', 'BOX'));

  it('refuses literal Lvl and enum LVL', () =>
    expectRefused("literal Lvl {\n  'a'\n}\nenum LVL {\n  A\n}\n", 'Lvl', 'LVL'));

  it('refuses the pair when declared in separate files', async () => {
    const result = await generateFixture({
      'a.cerial': 'model Post {\n  id Record @id\n}\n',
      'b.cerial': 'model POST {\n  id Record @id\n}\n',
    });

    expect(result.exitCode).not.toBe(0);
    expect(written(result.output)).toEqual([]);
  });

  it('refuses literal Index and literal INDEX', async () => {
    for (const name of ['Index', 'INDEX']) {
      const result = await generateFixture({ 'a.cerial': `literal ${name} {\n  'a'\n}\n` });

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('index');
      expect(written(result.output)).toEqual([]);
    }
  });

  it('refuses model PostWhere next to model Post', () =>
    expectRefused('model Post {\n  id Record @id\n}\nmodel PostWhere {\n  id Record @id\n}\n', 'PostWhere', 'Post'));

  it('refuses object PostCreate next to model Post', () =>
    expectRefused('model Post {\n  id Record @id\n}\nobject PostCreate {\n  a String\n}\n', 'PostCreate', 'Post'));

  it('refuses PostNested and PostGroupBy next to Post, and PostFindUnique as an object', () =>
    expectRefused(
      'model Post {\n  id Record @id\n}\nmodel PostNested {\n  id Record @id\n}\nmodel PostGroupBy {\n  id Record @id\n}\nobject PostFindUnique {\n  a String\n}\n',
      'PostNested',
      'Post',
    ));

  it('refuses model CerialClient and object ClientOptions', () =>
    expectRefused(
      'model CerialClient {\n  id Record @id\n}\nobject ClientOptions {\n  a String\n}\n',
      'CerialClient',
      'the generated client',
    ));

  it('refuses model CerialTransaction and object CerialId', () =>
    expectRefused(
      'model CerialTransaction {\n  id Record @id\n}\nobject CerialId {\n  a String\n}\n',
      'CerialTransaction',
      'the generated client',
    ));

  it('refuses model A and object O, the local names of the toolbelt imports', () =>
    expectRefused('model A {\n  id Record @id\n}\nobject O {\n  a String\n}\n', 'A', 'the generated client'));

  it('still generates Post and Comment', async () => {
    const result = await generateFixture({
      'a.cerial': 'model Post {\n  id Record @id\n}\nmodel Comment {\n  id Record @id\n}\n',
    });

    expect(result.exitCode).toBe(0);
  });

  it('still generates Post and PostTag', async () => {
    const result = await generateFixture({
      'a.cerial': 'model Post {\n  id Record @id\n}\nmodel PostTag {\n  id Record @id\n}\n',
    });

    expect(result.exitCode).toBe(0);
  });
});
