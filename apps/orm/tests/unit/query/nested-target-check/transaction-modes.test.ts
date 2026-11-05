/**
 * The guarded check inside `$transaction`. Array mode runs a compiled query item with its BEGIN stripped;
 * callback and manual mode run the model's own builder on the SDK transaction. Both read the same
 * position and raise the same typed error as a standalone write.
 */

import { describe, expect, test } from 'bun:test';
import { QueryError, SurrealTransaction, type Surreal } from 'surrealdb';
import { wrapDatabaseError } from '../../../../src/client/model/wrap-database-error';
import { CerialError, CerialValidationError } from '../../../../src/errors';
import {
  compileCreate,
  compileUpdateMany,
  compileUpdateUnique,
  compileUpsert,
  QueryBuilder,
} from '../../../../src/query/builder';
import { executeClientTransaction, type TransactionItem } from '../../../../src/query/executor';
import { existsRead, registry, userModel, userRow } from './helpers';

const createData = { email: 'a@b.co', name: 'A' };

async function failure(call: () => Promise<unknown>): Promise<unknown> {
  try {
    await call();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to reject');
}

interface Recorded {
  sent: Array<{ text: string; vars: Record<string, unknown> }>;
  ended: string[];
}

/** A transaction handle that answers each query with the next queued `collect()` result */
function fakeTransaction(...answers: unknown[][]): { txn: SurrealTransaction; recorded: Recorded } {
  const recorded: Recorded = { sent: [], ended: [] };
  const txn = Object.create(SurrealTransaction.prototype) as SurrealTransaction;
  Object.assign(txn, {
    query: (bound: { query: string; bindings: Record<string, unknown> }) => ({
      collect: async () => {
        recorded.sent.push({ text: bound.query, vars: bound.bindings });
        const answer = answers[recorded.sent.length - 1];
        if (!answer) throw new Error('fakeTransaction: no answer queued for this query');

        return answer;
      },
    }),
    commit: async () => void recorded.ended.push('commit'),
    cancel: async () => void recorded.ended.push('cancel'),
  });

  return { txn, recorded };
}

/** A database whose transaction is `fakeTransaction`'s */
function fakeDb(...answers: unknown[][]): { db: Surreal; recorded: Recorded } {
  const { txn, recorded } = fakeTransaction(...answers);

  return { db: { beginTransaction: async () => txn } as unknown as Surreal, recorded };
}

const asItem = (descriptor: ReturnType<typeof compileCreate>): TransactionItem => ({
  compiledQuery: descriptor.query,
  resultType: descriptor.resultType,
  metadata: userModel,
  registry,
});

// The stripped text has no BEGIN: [LET, RETURN $target_missing, IF, ...] for a write,
// [LET exists, LET missing, RETURN $up_missing, IF] for an upsert
const writeMissing = (position: number): unknown[] => [null, position, null];
const upsertMissing = (position: number): unknown[] => [null, null, position, null];

describe('array mode', () => {
  const cases: Array<{ name: string; item: () => TransactionItem; answer: unknown[]; message: string; field: string }> =
    [
      {
        name: 'create',
        item: () =>
          asItem(compileCreate(userModel, { data: { ...createData, profile: { connect: 'profile:i' } } }, registry)),
        answer: writeMissing(0),
        message: 'Field "profile" on model "User": cannot connect Profile record "profile:i" because it does not exist',
        field: 'profile',
      },
      {
        name: 'updateMany',
        item: () =>
          asItem(
            compileUpdateMany(
              userModel,
              { where: { name: 'A' }, data: { tags: { connect: ['tag:a', 'tag:b'] } } },
              registry,
            ),
          ),
        answer: writeMissing(1),
        message: 'Field "tags" on model "User": cannot connect Tag record "tag:b" because it does not exist',
        field: 'tags',
      },
      {
        name: 'updateUnique',
        item: () =>
          asItem(
            compileUpdateUnique(userModel, { where: { id: 'user:1' }, data: { tags: { set: ['tag:h'] } } }, registry),
          ),
        answer: writeMissing(0),
        message: 'Field "tags" on model "User": cannot set Tag record "tag:h" because it does not exist',
        field: 'tags',
      },
    ];

  for (const { name, item, answer, message, field } of cases) {
    test(`${name}: a mapped position is the typed error and the transaction is cancelled`, async () => {
      const { db, recorded } = fakeDb(answer);
      const error = await failure(() => executeClientTransaction(db, [item()]));

      expect(error).toBeInstanceOf(CerialValidationError);
      expect((error as CerialValidationError).message).toBe(message);
      expect(error).toMatchObject({ model: 'User', field, operation: name });
      expect(recorded.ended).toEqual(['cancel']);
    });
  }

  test('the guard carries the position of its RETURN into the item', () => {
    const { query } = compileCreate(
      userModel,
      { data: { ...createData, profile: { connect: 'profile:i' } } },
      registry,
    );

    expect(query.text.split('\n')[query.targetCheck!.at]).toBe('RETURN $target_missing;');
  });

  test('present targets commit the write', async () => {
    const { db, recorded } = fakeDb([null, null, [userRow]]);
    const [row] = await executeClientTransaction(db, [
      asItem(compileCreate(userModel, { data: { ...createData, profile: { connect: 'profile:i' } } }, registry)),
    ]);

    expect(row).toMatchObject({ email: 'a@b.co' });
    expect(recorded.ended).toEqual(['commit']);
  });

  test('an unmapped position is not the typed error', async () => {
    const { db } = fakeDb(writeMissing(5));
    const error = await failure(() =>
      executeClientTransaction(db, [
        asItem(compileCreate(userModel, { data: { ...createData, profile: { connect: 'profile:i' } } }, registry)),
      ]),
    );

    expect(error).not.toBeInstanceOf(CerialValidationError);
  });

  test('a database error passes through wrapDatabaseError unchanged', async () => {
    const driver = new QueryError({ kind: 'Query', message: 'boom', details: { kind: 'TimedOut' } });
    const { txn } = fakeTransaction();
    Object.assign(txn, {
      query: () => ({
        collect: async () => {
          throw driver;
        },
      }),
    });
    const db = { beginTransaction: async () => txn } as unknown as Surreal;
    const error = await failure(() =>
      executeClientTransaction(db, [
        asItem(compileCreate(userModel, { data: { ...createData, profile: { connect: 'profile:i' } } }, registry)),
      ]),
    );

    expect(error).toBe(driver);
    expect(wrapDatabaseError(error, 'User', 'create')).toBeInstanceOf(CerialError);
  });
});

describe('array mode, upsert', () => {
  const upsertItem = (): TransactionItem =>
    asItem(
      compileUpsert(
        userModel,
        {
          where: { id: 'user:1' },
          create: { ...createData, profile: { connect: 'profile:i' }, tags: { connect: ['tag:a', 'tag:b'] } },
          update: { tags: { connect: ['tag:c', 'tag:d'] } },
        },
        registry,
      ),
    );

  test('one check covers both halves, ahead of the branch', () => {
    const query = upsertItem().compiledQuery;
    const lines = query.text.split('\n');

    expect(lines.filter((line) => line.includes('$up_missing = '))).toHaveLength(1);
    expect(lines.filter((line) => line.includes('SELECT VALUE id FROM ONLY'))).toHaveLength(1);
    expect(lines[query.targetCheck!.at]).toBe('RETURN $up_missing;');
    expect(lines).toContain('IF $up_missing IS NONE {');
    expect(lines.at(-1)).toBe('COMMIT TRANSACTION;');
    expect(lines.at(-2)).toBe('};');
    // The write and its RETURN sit inside the block; nothing but COMMIT follows it
    expect(lines.at(-3)).toMatch(/^RETURN /);
    expect(query.text).not.toContain('THROW');
  });

  test('the update half reads first, the create half pads with true, and the other way round', () => {
    const { text } = upsertItem().compiledQuery;
    const check = text.split('\n').find((line) => line.startsWith('LET $up_missing'))!;
    const read = '\\(SELECT VALUE id FROM ONLY \\$\\w+\\)';

    expect(check).toMatch(new RegExp(`IF \\$up_exists \\{ \\[${read}, ${read}, true, true, true\\] \\}`));
    expect(check).toMatch(
      new RegExp(`ELSE \\{ \\[true, true, ${read}, ${read}, ${read}\\] \\}\\)\\.find_index\\(NONE\\);$`),
    );
  });

  test('the side table lists the update half, then the create half, in request order', () => {
    const { targetCheck } = upsertItem().compiledQuery;

    expect(targetCheck?.operation).toBe('upsert');
    expect(targetCheck?.entries.map((entry) => `${entry.field}:${entry.id}`)).toEqual([
      'tags:tag:c',
      'tags:tag:d',
      'profile:profile:i',
      'tags:tag:a',
      'tags:tag:b',
    ]);
  });

  test('the two halves bind their reads under different names', () => {
    const names = Object.keys(upsertItem().compiledQuery.vars);

    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((name) => name.includes('validate'))).toHaveLength(5);
  });

  test('an upsert with no connect or set keeps the unguarded text', () => {
    const { query } = compileUpsert(
      userModel,
      { where: { id: 'user:1' }, create: { ...createData, profile: { create: { bio: 'x' } } }, update: {} },
      registry,
    );

    expect(query.targetCheck).toBeUndefined();
    expect(query.text).not.toContain('up_missing');
  });

  const missing: Array<[string, number, string]> = [
    ['the first update-half id', 0, 'Tag record "tag:c"'],
    ['the second update-half id', 1, 'Tag record "tag:d"'],
    ['the create half profile', 2, 'Profile record "profile:i"'],
    ['the last create-half id', 4, 'Tag record "tag:b"'],
  ];

  for (const [name, position, text] of missing) {
    test(`a missing target at position ${position} (${name}) is the typed error`, async () => {
      const { db, recorded } = fakeDb(upsertMissing(position));
      const error = await failure(() => executeClientTransaction(db, [upsertItem()]));

      expect(error).toBeInstanceOf(CerialValidationError);
      expect((error as CerialValidationError).message).toContain(text);
      expect(error).toMatchObject({ model: 'User', operation: 'upsert' });
      expect(recorded.ended).toEqual(['cancel']);
    });
  }

  test('two missing report the first in request order (the position the database returns)', async () => {
    const { db } = fakeDb(upsertMissing(3));
    const error = await failure(() => executeClientTransaction(db, [upsertItem()]));

    expect((error as CerialValidationError).message).toContain('"tag:a"');
    expect((error as CerialValidationError).message).not.toContain('"tag:b"');
  });

  test('every target present commits the row the block yields', async () => {
    const { db, recorded } = fakeDb([null, null, null, userRow]);
    const [row] = await executeClientTransaction(db, [upsertItem()]);

    expect(row).toMatchObject({ email: 'a@b.co' });
    expect(recorded.ended).toEqual(['commit']);
  });

  test('an unmapped position is not the typed error', async () => {
    const { db } = fakeDb(upsertMissing(9));
    const error = await failure(() => executeClientTransaction(db, [upsertItem()]));

    expect(error).not.toBeInstanceOf(CerialValidationError);
  });
});

describe('callback and manual mode', () => {
  const builder = (txn: SurrealTransaction) =>
    new QueryBuilder<Record<string, unknown>>(txn as unknown as Surreal, userModel, registry);

  test('create: the stripped guard maps its position and the caller can carry on', async () => {
    const { txn, recorded } = fakeTransaction(writeMissing(0), [null, null, [userRow]]);
    const error = await failure(() =>
      builder(txn).create({ data: { ...createData, profile: { connect: 'profile:i' } } }),
    );

    expect(error).toBeInstanceOf(CerialValidationError);
    expect(error).toMatchObject({ model: 'User', field: 'profile', operation: 'create' });
    expect(recorded.sent[0]!.text).not.toContain('BEGIN');

    // The refusal wrote nothing, so the transaction is still usable and commits
    await builder(txn).create({ data: createData });
    expect(recorded.sent).toHaveLength(2);
  });

  test('updateMany, updateUnique and upsert name their own operation', async () => {
    const updateMany = await failure(() =>
      builder(fakeTransaction(writeMissing(1)).txn).updateMany({
        where: { name: 'A' },
        data: { tags: { connect: ['tag:a', 'tag:b'] } },
      }),
    );
    const updateUnique = await failure(() =>
      builder(fakeTransaction(writeMissing(0)).txn).updateUnique({
        where: { id: 'user:1' },
        data: { tags: { set: ['tag:h'] } },
      }),
    );
    const upsert = await failure(() =>
      builder(fakeTransaction(existsRead, writeMissing(0)).txn).upsert({
        where: { id: 'user:1' },
        create: createData,
        update: { tags: { connect: ['tag:f'] } },
      }),
    );

    expect(updateMany).toMatchObject({ operation: 'updateMany', field: 'tags' });
    expect((updateMany as CerialValidationError).message).toContain('"tag:b"');
    expect(updateUnique).toMatchObject({ operation: 'updateUnique', field: 'tags' });
    expect(upsert).toMatchObject({ operation: 'upsert', field: 'tags' });
  });

  test('present targets return the row', async () => {
    const { txn, recorded } = fakeTransaction([null, null, [userRow]]);
    const row = await builder(txn).create({ data: { ...createData, profile: { connect: 'profile:a' } } });

    expect(row).toMatchObject({ email: 'a@b.co' });
    expect(recorded.sent).toHaveLength(1);
  });

  test('an unmapped position is not the typed error', async () => {
    const { txn } = fakeTransaction(writeMissing(7));
    const error = await failure(() =>
      builder(txn).create({ data: { ...createData, profile: { connect: 'profile:i' } } }),
    );

    expect(error).not.toBeInstanceOf(CerialValidationError);
  });

  test('a database error reaches the caller unchanged', async () => {
    const driver = new QueryError({ kind: 'Query', message: 'boom', details: { kind: 'TimedOut' } });
    const { txn } = fakeTransaction();
    Object.assign(txn, {
      query: () => ({
        collect: async () => {
          throw driver;
        },
      }),
    });
    const error = await failure(() =>
      builder(txn).create({ data: { ...createData, profile: { connect: 'profile:i' } } }),
    );

    expect(error).toBe(driver);
  });
});
