/**
 * `Record(...)` id-type parameters on an object field reach the generated registry as string literals,
 * so they must be refused at generate, the same as on a model field.
 */

import { afterAll, describe, expect, it } from 'bun:test';
import { cleanupFixtures, generateFixture } from './helpers';

afterAll(cleanupFixtures);

const HOST = 'model Host {\n  id Record @id\n  name String\n}\n';
const PAYLOAD = "x'+[globalThis.PWNED_REC='object-record-id-type']+'";

async function expectRefused(source: string): Promise<void> {
  const result = await generateFixture({ 'a.cerial': source });

  expect(result.exitCode).not.toBe(0);
  expect(result.stdout + result.stderr).toContain('record ID type');
  expect(result.output.filter((f) => f !== '.cerial-output.json')).toEqual([]);
  expect(result.stdout).not.toContain('PWNED');
}

describe('Record(...) parameters on object fields', () => {
  it('refuses a Record id-type payload on an object field', () =>
    expectRefused(`${HOST}\nobject Ob {\n  r Record(${PAYLOAD})?\n}\n`));

  it('refuses the payload on a nested object', () =>
    expectRefused(
      `${HOST}\nobject Inner {\n  r Record(${PAYLOAD})?\n}\nobject Outer {\n  inner Inner\n}\nmodel Uses {\n  id Record @id\n  o Outer\n}\n`,
    ));

  it('refuses the payload on an object used as a tuple element', () =>
    expectRefused(
      `${HOST}\nobject Ob {\n  r Record(${PAYLOAD})?\n}\ntuple Pair {\n  Ob,\n  Float\n}\nmodel Uses {\n  id Record @id\n  p Pair\n}\n`,
    ));

  it('refuses an undefined type name on an object field', async () => {
    const result = await generateFixture({ 'a.cerial': `${HOST}\nobject Ob {\n  r Record(Missing)?\n}\n` });

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('Missing');
    expect(result.output.filter((f) => f !== '.cerial-output.json')).toEqual([]);
  });

  it('still generates and imports Record(string), Record(int) and Record(uuid) on object fields', async () => {
    const result = await generateFixture({
      'a.cerial': `${HOST}\nobject Ob {\n  a Record(string)?\n  b Record(int)?\n  c Record(uuid)?\n  d Record(string, int)?\n}\nmodel Uses {\n  id Record @id\n  o Ob\n}\n`,
    });

    expect(result.exitCode).toBe(0);
    const imported = await result.importClient();
    expect(imported.exitCode).toBe(0);
  });

  it('refuses the payload from a TypeScript schema module', async () => {
    const source = [
      "import { defineSchema, f, model, object } from 'cerial/schema';",
      `const P = ${JSON.stringify(PAYLOAD)};`,
      "export const Ob = object('Ob', { r: f.record(P as never).optional() });",
      "export const H = model('H', { id: f.record().id(), ob: f.object(Ob) });",
      'export default defineSchema({ models: [H] });',
    ].join('\n');
    const result = await generateFixture({ 'app.schema.ts': source });

    expect(result.exitCode).not.toBe(0);
    expect(result.output.filter((f) => f !== '.cerial-output.json')).toEqual([]);
    expect(result.stdout).not.toContain('PWNED');
  });
});
