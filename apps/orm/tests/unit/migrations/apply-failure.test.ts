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

describe('applyPlan: server text in the error', () => {
  const hostile = 'boom \u001b[2J\u001b]52;c;cHduZWQ\u0007 line\r\nforged';

  test('control characters in the server message are shown as escapes', async () => {
    const error = await failureOf([ok, fail(hostile)]);

    // oxlint-disable-next-line no-control-regex -- the point is that none remain
    expect(error.message).not.toMatch(/[\u0000-\u0008\u000a-\u001f\u007f]/);
    expect(error.message).toContain('boom \\u{1b}[2J\\u{1b}]52;c;cHduZWQ\\u{7} line\\r\\nforged');
  });

  test('a message without control characters is unchanged', async () => {
    expect((await failureOf([ok, fail('An error occurred: boom')])).message).toContain(
      'failed: An error occurred: boom',
    );
  });

  test('the rolled-back message for a transaction-level failure is escaped too', async () => {
    const error = await failureOf([ok, ok, ok, fail(hostile)]);

    // oxlint-disable-next-line no-control-regex -- the point is that none remain
    expect(error.message).not.toMatch(/[\u0000-\u0008\u000a-\u001f\u007f]/);
  });
});

describe('applyPlan: the script it sends', () => {
  async function sent(statements: string[]): Promise<string> {
    let script = '';
    const surreal = {
      query: (text: string) => ({
        responses: async () => {
          if (text.startsWith('BEGIN')) script = text;

          return text.startsWith('BEGIN') ? [ok, ...statements.map(() => ok), ok, ok] : [ok];
        },
        collect: async () => [{ tables: {} }],
      }),
    } as unknown as Surreal;
    const steps = statements.map((statement) => ({
      statement,
      class: 'additive' as const,
      reason: 'r',
      construct: 'field',
      table: 'user',
    }));
    await applyPlan(surreal, steps, options);

    return script;
  }

  test('a statement ending in a comment does not swallow the semicolon that ends it', async () => {
    const script = await sent([
      'DEFINE FIELD OVERWRITE a ON TABLE user TYPE string -- why',
      'DEFINE FIELD b ON TABLE user TYPE int',
    ]);

    expect(script).toContain('-- why\n;\nDEFINE FIELD b');
    expect(script).not.toMatch(/--[^\n]*;/);
  });

  test('near miss: a plain statement is still terminated and the script still ends in COMMIT', async () => {
    const script = await sent(['DEFINE FIELD a ON TABLE user TYPE string']);

    expect(script).toContain('DEFINE FIELD a ON TABLE user TYPE string\n;\n');
    expect(script).toContain('COMMIT\n;\n');
  });
});

describe('applyPlan: a refusal that asks for a data migration', () => {
  test('is reported with what to do about it', async () => {
    const error = await failureOf([
      ok,
      fail('Cannot change field `age` of table `user`: add MIGRATE EXISTING ROWS to say what existing rows hold'),
      fail('Cannot COMMIT: the transaction was aborted due to a prior error'),
    ]);

    expect(error.message).toContain('`age`');
    expect(error.message).toContain('add a @default or make the field optional');
  });

  test('near miss: another failure carries no data-migration advice', async () => {
    const error = await failureOf([
      ok,
      fail('The field already exists'),
      fail('Cannot COMMIT: the transaction was aborted'),
    ]);

    expect(error.message).not.toContain('@default');
  });
});
