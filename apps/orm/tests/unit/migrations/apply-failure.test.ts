import { describe, expect, test } from 'bun:test';
import type { Surreal } from 'surrealdb';
import { CerialMigrationError } from '../../../src/errors';
import { applyPlan, type MigrationLease } from '../../../src/migrations';

interface Reply {
  readonly success: boolean;
  readonly error?: { message: string };
}

const ok: Reply = { success: true };
const fail = (message: string): Reply => ({ success: false, error: { message } });

/** A connection whose transaction script answers `script` and whose other queries succeed. */
function fake(script: Reply[]): Surreal {
  return {
    query: (text: string) => ({
      responses: async () => (text.startsWith('BEGIN') ? script : [ok]),
      collect: async () => [{ tables: {} }],
    }),
  } as unknown as Surreal;
}

const lease = { holderCheck: () => ({ query: 'RETURN 1', bindings: {} }) } as unknown as MigrationLease;
const plan = [
  {
    statement: 'DEFINE TABLE OVERWRITE user SCHEMAFULL',
    class: 'additive',
    reason: 'r',
    construct: 'table',
    table: 'user',
  },
] as const;
const options = {
  schemaName: 'app',
  cerialVersion: 'x',
  lease,
  // No models: nothing to re-read after the commit.
  models: [],
};

async function failureOf(script: Reply[]): Promise<CerialMigrationError> {
  const error = await applyPlan(fake(script), plan, options).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(CerialMigrationError);

  return error as CerialMigrationError;
}

describe('applyPlan: which response is the cause', () => {
  test('a COMMIT that fails by itself surfaces its own error and blames no statement', async () => {
    // BEGIN, the statement, the state tail, COMMIT
    const error = await failureOf([ok, ok, ok, fail('Cannot COMMIT: write conflict, retry the transaction')]);

    expect(error.message).toContain('write conflict');
    expect(error.statement).toBeUndefined();
  });

  test('near miss: the follow-on answers of a statement failure still name that statement', async () => {
    const error = await failureOf([
      ok,
      fail('An error occurred: boom'),
      fail('The query was not executed due to a failed transaction'),
      fail('The query was not executed due to a cancelled transaction'),
      fail('Cannot COMMIT: the transaction was aborted due to a prior error'),
    ]);

    expect(error.message).toContain('boom');
    expect(error.statement?.text).toBe('DEFINE TABLE OVERWRITE user SCHEMAFULL');
  });
});
