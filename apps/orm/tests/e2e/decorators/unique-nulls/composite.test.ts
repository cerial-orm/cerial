import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, testConfig, truncateTables } from '../../test-helper';
import { NN_TABLES, caught, expectUniqueViolation } from './helpers';

/**
 * E2E Tests: @@unique(name, [a, b], nullsNotDistinct) composite
 *
 * NnSlot has tenantId and slug, both nullable. The tuple is compared when no column is absent; a null
 * column counts as a value, an absent column exempts the whole tuple.
 */

describe('@@unique(..., nullsNotDistinct): composite', () => {
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

  test('[null, null] twice is refused, naming the composite index', async () => {
    await client.db.NnSlot.create({ data: { tenantId: null, slug: null } });
    const error = await caught(() => client.db.NnSlot.create({ data: { tenantId: null, slug: null } }));

    expectUniqueViolation(error, { model: 'NnSlot', operation: 'create', index: 'tenantSlug' });
    expect(await client.db.NnSlot.count()).toBe(1);
  });

  test('[value, null] twice is refused', async () => {
    await client.db.NnSlot.create({ data: { tenantId: 't1', slug: null } });
    const error = await caught(() => client.db.NnSlot.create({ data: { tenantId: 't1', slug: null } }));

    expectUniqueViolation(error, { model: 'NnSlot', operation: 'create', index: 'tenantSlug' });
  });

  test('[null, value] twice is refused', async () => {
    await client.db.NnSlot.create({ data: { tenantId: null, slug: 's1' } });
    const error = await caught(() => client.db.NnSlot.create({ data: { tenantId: null, slug: 's1' } }));

    expectUniqueViolation(error, { model: 'NnSlot', operation: 'create', index: 'tenantSlug' });
  });

  test('[value, value] twice is refused', async () => {
    await client.db.NnSlot.create({ data: { tenantId: 't1', slug: 's1' } });
    const error = await caught(() => client.db.NnSlot.create({ data: { tenantId: 't1', slug: 's1' } }));

    expectUniqueViolation(error, { model: 'NnSlot', operation: 'create', index: 'tenantSlug' });
  });

  test('tuples that differ in any column coexist', async () => {
    await client.db.NnSlot.create({ data: { tenantId: null, slug: null } });
    await client.db.NnSlot.create({ data: { tenantId: 't1', slug: null } });
    await client.db.NnSlot.create({ data: { tenantId: null, slug: 's1' } });
    await client.db.NnSlot.create({ data: { tenantId: 't1', slug: 's1' } });
    await client.db.NnSlot.create({ data: { tenantId: 't2', slug: 's1' } });

    expect(await client.db.NnSlot.count()).toBe(5);
  });

  test('a tuple with an absent column is never compared', async () => {
    await client.db.NnSlot.create({ data: { tenantId: 't1' } });
    await client.db.NnSlot.create({ data: { tenantId: 't1' } });
    await client.db.NnSlot.create({ data: { slug: 's1' } });
    await client.db.NnSlot.create({ data: { slug: 's1' } });
    await client.db.NnSlot.create({ data: {} });
    await client.db.NnSlot.create({ data: {} });
    await client.db.NnSlot.create({ data: { tenantId: null } });
    await client.db.NnSlot.create({ data: { tenantId: null } });

    expect(await client.db.NnSlot.count()).toBe(8);
  });

  test('an absent column is not a null: [t1, absent] does not conflict with [t1, null]', async () => {
    await client.db.NnSlot.create({ data: { tenantId: 't1', slug: null } });
    await client.db.NnSlot.create({ data: { tenantId: 't1' } });

    expect(await client.db.NnSlot.count()).toBe(2);
  });

  test('updating a record into an existing [null, null] tuple is refused', async () => {
    await client.db.NnSlot.create({ data: { tenantId: null, slug: null } });
    const other = await client.db.NnSlot.create({ data: { tenantId: 't1', slug: 's1' } });

    const error = await caught(() =>
      client.db.NnSlot.updateUnique({ where: { id: other.id }, data: { tenantId: null, slug: null } }),
    );

    expectUniqueViolation(error, { model: 'NnSlot', operation: 'updateUnique', index: 'tenantSlug' });
    const unchanged = await client.db.NnSlot.findOne({ where: { id: other.id } });
    expect(unchanged!.tenantId).toBe('t1');
  });
});
