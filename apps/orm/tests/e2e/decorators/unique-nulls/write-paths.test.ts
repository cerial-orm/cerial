import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialUniqueConstraintError } from 'cerial';
import { type CerialClient, cleanupTables, createTestClient, testConfig, truncateTables } from '../../test-helper';
import { NN_TABLES, caught, expectUniqueViolation, user } from './helpers';

/**
 * E2E Tests: @unique(nullsNotDistinct) across write paths
 *
 * update, updateMany (with unset), upsert, delete, findUnique and $transaction on NnUser.nickname.
 * Cerial has no createMany; the single-create paths cover the index.
 */

describe('@unique(nullsNotDistinct): write paths', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, NN_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, NN_TABLES);
  });

  test('updateUnique into a second null is refused and leaves the row untouched', async () => {
    await client.db.NnUser.create({ data: user({ nickname: null }) });
    const other = await client.db.NnUser.create({ data: user({ nickname: 'ada' }) });

    const error = await caught(() =>
      client.db.NnUser.updateUnique({ where: { id: other.id }, data: { nickname: null } }),
    );

    expectUniqueViolation(error, { model: 'NnUser', operation: 'updateUnique', index: 'nn_user_nickname_unique' });
    expect((await client.db.NnUser.findOne({ where: { id: other.id } }))!.nickname).toBe('ada');
  });

  test('updateMany that would give two rows a null is refused', async () => {
    await client.db.NnUser.create({ data: user({ nickname: 'a' }) });
    await client.db.NnUser.create({ data: user({ nickname: 'b' }) });

    const error = await caught(() => client.db.NnUser.updateMany({ where: {}, data: { nickname: null } }));

    expect(error).toBeInstanceOf(CerialUniqueConstraintError);
    expect(await client.db.NnUser.count({ nickname: null })).toBe(0);
  });

  test('updateMany setting null on a single row is accepted', async () => {
    await client.db.NnUser.create({ data: user({ nickname: 'a' }) });
    await client.db.NnUser.create({ data: user({ nickname: 'b' }) });

    await client.db.NnUser.updateMany({ where: { nickname: 'a' }, data: { nickname: null } });

    expect(await client.db.NnUser.count({ nickname: null })).toBe(1);
  });

  test('unsetting the null (NONE) frees the slot for another null', async () => {
    const first = await client.db.NnUser.create({ data: user({ nickname: null }) });

    await client.db.NnUser.updateUnique({ where: { id: first.id }, data: {}, unset: { nickname: true } });
    await client.db.NnUser.create({ data: user({ nickname: null }) });

    expect(await client.db.NnUser.count({ nickname: null })).toBe(1);
    expect(await client.db.NnUser.count()).toBe(2);
  });

  test('unsetting two rows to NONE is allowed', async () => {
    await client.db.NnUser.create({ data: user({ nickname: 'a' }) });
    await client.db.NnUser.create({ data: user({ nickname: 'b' }) });

    await client.db.NnUser.updateMany({ where: {}, data: {}, unset: { nickname: true } });

    expect(await client.db.NnUser.count()).toBe(2);
    expect(await client.db.NnUser.count({ nickname: null })).toBe(0);
  });

  test('deleting the null row frees the slot', async () => {
    const first = await client.db.NnUser.create({ data: user({ nickname: null }) });

    await client.db.NnUser.deleteUnique({ where: { id: first.id } });
    await client.db.NnUser.create({ data: user({ nickname: null }) });

    expect(await client.db.NnUser.count({ nickname: null })).toBe(1);
  });

  test('upsert whose create path would be a second null is refused', async () => {
    await client.db.NnUser.create({ data: user({ nickname: null }) });
    const email = 'upsert-create@example.com';

    const error = await caught(() =>
      client.db.NnUser.upsert({
        where: { email },
        create: { email, nickname: null },
        update: { nickname: 'never' },
      }),
    );

    expectUniqueViolation(error, { model: 'NnUser', operation: 'upsert', index: 'nn_user_nickname_unique' });
    expect(await client.db.NnUser.count({ email })).toBe(0);
  });

  test('upsert whose update path would be a second null is refused', async () => {
    await client.db.NnUser.create({ data: user({ nickname: null }) });
    const email = 'upsert-update@example.com';
    await client.db.NnUser.create({ data: { email, nickname: 'ada' } });

    const error = await caught(() =>
      client.db.NnUser.upsert({ where: { email }, create: { email, nickname: 'x' }, update: { nickname: null } }),
    );

    expectUniqueViolation(error, { model: 'NnUser', operation: 'upsert', index: 'nn_user_nickname_unique' });
    expect((await client.db.NnUser.findOne({ where: { email } }))!.nickname).toBe('ada');
  });

  test('upsert that creates the first null, then updates it in place, is accepted', async () => {
    const email = 'upsert-ok@example.com';
    await client.db.NnUser.upsert({ where: { email }, create: { email, nickname: null }, update: { nickname: null } });
    const again = await client.db.NnUser.upsert({
      where: { email },
      create: { email, nickname: null },
      update: { nickname: null },
    });

    expect(again!.nickname).toBeNull();
    expect(await client.db.NnUser.count()).toBe(1);
  });

  test('findUnique by the nullsNotDistinct field finds the row holding the value', async () => {
    const ada = await client.db.NnUser.create({ data: user({ nickname: 'ada' }) });
    await client.db.NnUser.create({ data: user({ nickname: null }) });

    const found = await client.db.NnUser.findUnique({ where: { nickname: 'ada' } });
    const missing = await client.db.NnUser.findUnique({ where: { nickname: 'nobody' } });

    expect(found!.id).toEqual(ada.id);
    expect(missing).toBeNull();
  });

  test('findUnique on the composite finds the [null, null] tuple', async () => {
    const row = await client.db.NnSlot.create({ data: { tenantId: null, slug: null } });
    await client.db.NnSlot.create({ data: { tenantId: 't1', slug: null } });

    const found = await client.db.NnSlot.findUnique({ where: { tenantSlug: { tenantId: null, slug: null } } });

    expect(found!.id).toEqual(row.id);
  });

  test('$transaction: a second null in the same transaction is refused and nothing is kept', async () => {
    const error = await caught(() =>
      client.$transaction([
        client.db.NnUser.create({ data: user({ nickname: null }) }),
        client.db.NnUser.create({ data: user({ nickname: null }) }),
      ]),
    );

    expect(error).toBeInstanceOf(CerialUniqueConstraintError);
    expect(await client.db.NnUser.count()).toBe(0);
  });

  test('$transaction: a null clashing with a committed null is refused and the other items roll back', async () => {
    await client.db.NnUser.create({ data: user({ nickname: null }) });

    const error = await caught(() =>
      client.$transaction([
        client.db.NnUser.create({ data: user({ nickname: 'fresh' }) }),
        client.db.NnUser.create({ data: user({ nickname: null }) }),
      ]),
    );

    expect(error).toBeInstanceOf(CerialUniqueConstraintError);
    expect(await client.db.NnUser.count()).toBe(1);
  });

  test('$transaction: one null with absent nicknames commits', async () => {
    await client.$transaction([
      client.db.NnUser.create({ data: user({ nickname: null }) }),
      client.db.NnUser.create({ data: user() }),
      client.db.NnUser.create({ data: user() }),
    ]);

    expect(await client.db.NnUser.count()).toBe(3);
  });

  test('$transaction callback: freeing the slot and reusing it in one transaction commits', async () => {
    const first = await client.db.NnUser.create({ data: user({ nickname: null }) });

    await client.$transaction(async (tx) => {
      await tx.NnUser.deleteUnique({ where: { id: first.id } });
      await tx.NnUser.create({ data: user({ nickname: null }) });
    });

    expect(await client.db.NnUser.count({ nickname: null })).toBe(1);
  });

  test('$transaction: composite [null, null] twice is refused', async () => {
    const error = await caught(() =>
      client.$transaction([
        client.db.NnSlot.create({ data: { tenantId: null, slug: null } }),
        client.db.NnSlot.create({ data: { tenantId: null, slug: null } }),
      ]),
    );

    expect(error).toBeInstanceOf(CerialUniqueConstraintError);
    expect(await client.db.NnSlot.count()).toBe(0);
  });
});
