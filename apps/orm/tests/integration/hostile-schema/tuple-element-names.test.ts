/**
 * Every name the schema text carries reaches generated code, so a name
 * that is not a plain identifier must be refused before anything is written.
 */

import { afterAll, describe, expect, it } from 'bun:test';
import { cleanupFixtures, generateFixture } from './helpers';

afterAll(cleanupFixtures);

const HOST = 'model Host {\n  id Record @id\n  name String\n}\n';

async function expectRefused(source: string, message: string): Promise<void> {
  const result = await generateFixture({ 'a.cerial': source });

  expect(result.exitCode).not.toBe(0);
  expect(result.stdout + result.stderr).toContain(message);
  expect(result.output.filter((f) => f !== '.cerial-output.json')).toEqual([]);
}

describe('hostile schema names', () => {
  it('refuses a tuple element name that closes the registry string', async () => {
    const payload = "x'+console.log(`PWNED-tuple`)+'/**/declare/**/global/**/{interface/**/Window{q:1}}";
    const source = `${HOST}\ntuple Pair {\n  ${payload} Float,\n  y Float\n}\n`;
    const result = await generateFixture({ 'a.cerial': source });

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('tuple element');
    expect(result.output.filter((f) => f !== '.cerial-output.json')).toEqual([]);
    expect(result.stdout).not.toContain('PWNED');
  });

  it('refuses a digit-led enum name', () => expectRefused(`${HOST}\nenum 7E { A, B }\n`, '7E'));
  it('refuses a digit-led literal name', () => expectRefused(`${HOST}\nliteral 8L { 'a', 'b' }\n`, '8L'));
  it('refuses a digit-led tuple name', () => expectRefused(`${HOST}\ntuple 9T {\n  Float,\n  Float\n}\n`, '9T'));
  it('refuses a digit-led @@unique name', () =>
    expectRefused('model Host {\n  id Record @id\n  a String\n  b String\n  @@unique(1abc, [a, b])\n}\n', '1abc'));
  it('refuses the enum value __proto__', () => expectRefused(`${HOST}\nenum Role { ADMIN, __proto__ }\n`, '__proto__'));
  it('refuses a tuple element named constructor', () =>
    expectRefused(`${HOST}\ntuple Pair {\n  constructor Float,\n  y Float\n}\n`, 'constructor'));

  it('refuses a field named toString', () =>
    expectRefused('model Host {\n  id Record @id\n  toString String\n}\n', 'toString'));

  it('still generates and imports a tuple with elements x, _y and lat2', async () => {
    const result = await generateFixture({
      'a.cerial': `${HOST}\ntuple Pair {\n  x Float,\n  _y Float,\n  lat2 Float\n}\n`,
    });

    expect(result.exitCode).toBe(0);
    const imported = await result.importClient();
    expect(imported.exitCode).toBe(0);
  });
});
