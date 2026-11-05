import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialUniqueConstraintError } from 'cerial';
import { type CerialClient, cleanupTables, createTestClient, testConfig, truncateTables } from '../../test-helper';
import { NN_TABLES, caught, expectUniqueViolation, uniqueEmail, user } from './helpers';

/**
 * E2E Tests: upsert whose create path hits a unique index other than the one its where names
 *
 * The create path is refused the way create refuses it, for a plain @unique, a nullsNotDistinct field
 * and both kinds of composite, in every return mode and in every $transaction mode, and writes nothing.
 * The same upserts without the clash create or update as before.
 */

const PLAIN_NICK = 'nn_user_plainNick_unique';
const NICKNAME = 'nn_user_nickname_unique';

describe('@unique: upsert whose create path conflicts', () => {
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

  describe('plain @unique field', () => {
    test('a create path taking a held value is refused and writes nothing', async () => {
      await client.db.NnUser.create({ data: user({ plainNick: 'ada' }) });
      const email = uniqueEmail();

      const error = await caught(() =>
        client.db.NnUser.upsert({ where: { email }, create: { email, plainNick: 'ada' }, update: { plainNick: 'b' } }),
      );

      expectUniqueViolation(error, { model: 'NnUser', operation: 'upsert', index: PLAIN_NICK });
      expect(await client.db.NnUser.count()).toBe(1);
    });

    test('a create path taking a free value creates the row', async () => {
      await client.db.NnUser.create({ data: user({ plainNick: 'ada' }) });
      const email = uniqueEmail();

      const created = await client.db.NnUser.upsert({
        where: { email },
        create: { email, plainNick: 'grace' },
        update: { plainNick: 'b' },
      });

      expect(created!.plainNick).toBe('grace');
      expect(await client.db.NnUser.count()).toBe(2);
    });

    test('an update path on the matched row is accepted and leaves the other row alone', async () => {
      await client.db.NnUser.create({ data: user({ plainNick: 'ada' }) });
      const email = uniqueEmail();
      await client.db.NnUser.create({ data: { email, plainNick: 'grace' } });

      const updated = await client.db.NnUser.upsert({
        where: { email },
        create: { email, plainNick: 'ada' },
        update: { plainNick: 'hopper' },
      });

      expect(updated!.plainNick).toBe('hopper');
      expect(await client.db.NnUser.count({ plainNick: 'ada' })).toBe(1);
    });

    test('plain @unique still allows a second null through the create path', async () => {
      await client.db.NnUser.create({ data: user({ plainNick: null }) });
      const email = uniqueEmail();

      const created = await client.db.NnUser.upsert({ where: { email }, create: { email, plainNick: null } });

      expect(created!.plainNick).toBeNull();
      expect(await client.db.NnUser.count({ plainNick: null })).toBe(2);
    });

    test('a where on a non-unique field is refused the same way', async () => {
      await client.db.NnUser.create({ data: user({ plainNick: 'ada' }) });

      const error = await caught(() =>
        client.db.NnUser.upsert({
          where: { nickname: 'nobody' },
          create: { email: uniqueEmail(), plainNick: 'ada' },
        }),
      );

      expectUniqueViolation(error, { model: 'NnUser', operation: 'upsert', index: PLAIN_NICK });
      expect(await client.db.NnUser.count()).toBe(1);
    });
  });

  describe('every return mode is refused', () => {
    for (const mode of [undefined, 'after', 'before', true] as const) {
      test(`return ${String(mode)}`, async () => {
        await client.db.NnUser.create({ data: user({ nickname: null }) });
        const email = uniqueEmail();

        const error = await caught(() =>
          client.db.NnUser.upsert({ where: { email }, create: { email, nickname: null }, return: mode }),
        );

        expectUniqueViolation(error, { model: 'NnUser', operation: 'upsert', index: NICKNAME });
        expect(await client.db.NnUser.count()).toBe(1);
      });
    }

    test('return before with select', async () => {
      await client.db.NnUser.create({ data: user({ nickname: null }) });
      const email = uniqueEmail();

      const error = await caught(() =>
        client.db.NnUser.upsert({
          where: { email },
          create: { email, nickname: null },
          select: { email: true },
          return: 'before',
        }),
      );

      expectUniqueViolation(error, { model: 'NnUser', operation: 'upsert', index: NICKNAME });
      expect(await client.db.NnUser.count()).toBe(1);
    });

    test('without the clash, return before is null and return true is true on the create path', async () => {
      const before = await client.db.NnUser.upsert({
        where: { email: 'b@example.com' },
        create: { email: 'b@example.com', nickname: null },
        return: 'before',
      });
      const flag = await client.db.NnUser.upsert({
        where: { email: 't@example.com' },
        create: { email: 't@example.com', nickname: 'n' },
        return: true,
      });

      expect(before).toBeNull();
      expect(flag).toBe(true);
      expect(await client.db.NnUser.count()).toBe(2);
    });
  });

  describe('composite unique', () => {
    test('nullsNotDistinct: a create path giving a second [null, null] is refused', async () => {
      await client.db.NnSlot.create({ data: { tenantId: null, slug: null } });

      const error = await caught(() =>
        client.db.NnSlot.upsert({
          where: { tenantSlug: { tenantId: 't1', slug: null } },
          create: { tenantId: null, slug: null },
        }),
      );

      expectUniqueViolation(error, { model: 'NnSlot', operation: 'upsert', index: 'tenantSlug' });
      expect(await client.db.NnSlot.count()).toBe(1);
    });

    test('nullsNotDistinct: a create path matching its where creates the row', async () => {
      await client.db.NnSlot.create({ data: { tenantId: null, slug: null } });

      const created = await client.db.NnSlot.upsert({
        where: { tenantSlug: { tenantId: 't1', slug: null } },
        create: { tenantId: 't1', slug: null },
      });

      expect(created!.tenantId).toBe('t1');
      expect(await client.db.NnSlot.count()).toBe(2);
    });

    test('nullsNotDistinct: an update path on the matched tuple is accepted', async () => {
      await client.db.NnSlot.create({ data: { tenantId: null, slug: null } });

      const updated = await client.db.NnSlot.upsert({
        where: { tenantSlug: { tenantId: null, slug: null } },
        create: { tenantId: null, slug: null },
        update: { slug: 's' },
      });

      expect(updated!.slug).toBe('s');
      expect(await client.db.NnSlot.count()).toBe(1);
    });

    test('plain composite: a create path taking a held tuple is refused', async () => {
      await client.db.NnPlainSlot.create({ data: { tenantId: 't1', slug: 's' } });

      const error = await caught(() =>
        client.db.NnPlainSlot.upsert({
          where: { plainSlot: { tenantId: 't2', slug: 's' } },
          create: { tenantId: 't1', slug: 's' },
        }),
      );

      expectUniqueViolation(error, { model: 'NnPlainSlot', operation: 'upsert', index: 'plainSlot' });
      expect(await client.db.NnPlainSlot.count()).toBe(1);
    });

    test('plain composite: a second [null, null] through the create path is accepted', async () => {
      await client.db.NnPlainSlot.create({ data: { tenantId: null, slug: null } });

      await client.db.NnPlainSlot.upsert({
        where: { plainSlot: { tenantId: 't1', slug: null } },
        create: { tenantId: null, slug: null },
      });

      expect(await client.db.NnPlainSlot.count()).toBe(2);
    });
  });

  describe('by id', () => {
    test('a create path taking a held value is refused', async () => {
      await client.db.NnUser.create({ data: user({ nickname: null }) });

      const error = await caught(() =>
        client.db.NnUser.upsert({ where: { id: 'fresh' }, create: { email: uniqueEmail(), nickname: null } }),
      );

      expectUniqueViolation(error, { model: 'NnUser', operation: 'upsert', index: NICKNAME });
      expect(await client.db.NnUser.count()).toBe(1);
    });
  });

  describe('$transaction', () => {
    test('array mode: the clash is refused and the other items roll back', async () => {
      await client.db.NnUser.create({ data: user({ nickname: null }) });
      const email = uniqueEmail();

      const error = await caught(() =>
        client.$transaction([
          client.db.NnUser.create({ data: user({ nickname: 'fresh' }) }),
          client.db.NnUser.upsert({ where: { email }, create: { email, nickname: null } }),
        ]),
      );

      expect(error).toBeInstanceOf(CerialUniqueConstraintError);
      expect(await client.db.NnUser.count()).toBe(1);
    });

    test('array mode: two upserts without a clash both create', async () => {
      const [a, b] = await client.$transaction([
        client.db.NnUser.upsert({
          where: { email: 'a@example.com' },
          create: { email: 'a@example.com', nickname: 'a' },
        }),
        client.db.NnUser.upsert({
          where: { email: 'b@example.com' },
          create: { email: 'b@example.com', nickname: null },
        }),
      ]);

      expect(a!.nickname).toBe('a');
      expect(b!.nickname).toBeNull();
      expect(await client.db.NnUser.count()).toBe(2);
    });

    test('callback mode: the clash is refused and nothing is kept', async () => {
      await client.db.NnUser.create({ data: user({ nickname: null }) });
      const email = uniqueEmail();

      const error = await caught(() =>
        client.$transaction(async (tx) => {
          await tx.NnUser.create({ data: user({ nickname: 'fresh' }) });
          await tx.NnUser.upsert({ where: { email }, create: { email, nickname: null } });
        }),
      );

      expectUniqueViolation(error, { model: 'NnUser', operation: 'upsert', index: NICKNAME });
      expect(await client.db.NnUser.count()).toBe(1);
    });

    test('manual mode: the clash is refused and a cancel keeps nothing', async () => {
      await client.db.NnUser.create({ data: user({ nickname: null }) });
      const email = uniqueEmail();

      const txn = await client.$transaction();
      try {
        const error = await caught(() => txn.NnUser.upsert({ where: { email }, create: { email, nickname: null } }));
        expectUniqueViolation(error, { model: 'NnUser', operation: 'upsert', index: NICKNAME });
      } finally {
        await txn.cancel();
      }

      expect(await client.db.NnUser.count()).toBe(1);
    });

    test('manual mode: an upsert without a clash commits', async () => {
      const email = uniqueEmail();

      const txn = await client.$transaction();
      await txn.NnUser.upsert({ where: { email }, create: { email, nickname: null } });
      await txn.commit();

      expect(await client.db.NnUser.count({ email })).toBe(1);
    });
  });
});
