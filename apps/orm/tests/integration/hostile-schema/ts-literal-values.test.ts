/**
 * A TypeScript schema module can hand-build literal variants. A value that does not match its kind
 * reached the migration DDL and the generated registry code as written, so it is refused at load.
 */

import { afterAll, describe, expect, it } from 'bun:test';
import { cleanupFixtures, generateFixture } from './helpers';

afterAll(cleanupFixtures);

const HEAD = "import { f, literal, model, variant } from 'cerial/schema';\n";
const HOST = "export const Host = model('Host', { id: f.record().id(), name: f.string() });\n";
const PAYLOAD = "1; REMOVE TABLE victim; DEFINE FIELD pwn ON host TYPE string; '";

function schema(variants: string): string {
  return `${HEAD}${HOST}export const L = literal('L', [${variants}]);\nexport const U = model('U', { id: f.record().id(), l: f.literal(L) });\n`;
}

async function expectRefused(variants: string, message: string): Promise<void> {
  const result = await generateFixture({ 'a.schema.ts': schema(variants) });

  expect(result.exitCode).not.toBe(0);
  const text = result.stdout + result.stderr;
  expect(text).toContain(message);
  expect(text).toContain('L');
  expect(result.output.filter((f) => f !== '.cerial-output.json')).toEqual([]);
}

describe('hostile TypeScript literal values', () => {
  it('refuses variant.bool with a string payload', () =>
    expectRefused(`variant.bool(${JSON.stringify(PAYLOAD)} as never)`, 'variant.bool'));
  it('refuses a hand-built int whose value is text', () =>
    expectRefused(`{ kind: 'int', value: ${JSON.stringify(PAYLOAD)} } as never`, 'variant.int'));
  it('refuses a hand-built float whose value is text', () =>
    expectRefused(`{ kind: 'float', value: ${JSON.stringify(PAYLOAD)} } as never`, 'variant.float'));
  it('refuses a hand-built int beyond the safe range', () =>
    expectRefused("{ kind: 'int', value: 1e21 } as never", 'variant.int'));
  it('refuses a broadType outside the five names', () =>
    expectRefused(`variant.broadType(${JSON.stringify(PAYLOAD)} as never)`, 'variant.broadType'));
  it('refuses a hand-built object of an unknown kind', () =>
    expectRefused("{ kind: 'raw', value: 'x' } as never", 'unknown variant kind'));

  it('still generates and imports 1, 2.5, true, a string and every broad type', async () => {
    const all = [
      'variant.int(1)',
      'variant.float(2.5)',
      'variant.bool(true)',
      "variant.string('a')",
      ...['String', 'Int', 'Float', 'Bool', 'Date'].map((t) => `variant.broadType('${t}')`),
    ].join(', ');
    const result = await generateFixture({ 'a.schema.ts': schema(all) });

    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect((await result.importClient()).exitCode).toBe(0);
  });
});
