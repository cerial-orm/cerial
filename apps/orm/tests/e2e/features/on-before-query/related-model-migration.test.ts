/**
 * E2E Tests for lazy migration of related models
 *
 * A nested write or include must migrate the related model's table before it is
 * touched, otherwise SurrealDB creates it schemaless and a later migration
 * leaves rows that reject every write. The preload already defined all tables and
 * recorded their state, so each test forgets that state, uses a fresh client and
 * asserts which models that client migrated, plus that the related table stays writable.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { RecordId } from 'surrealdb';
import { CerialClient, cleanupTables, forgetMigrationState, tables, testConfig, uniqueEmail } from '../../test-helper';

describe('lazy migration of related models', () => {
  let client: CerialClient;
  let migrated: string[];

  beforeEach(async () => {
    migrated = [];
    client = new CerialClient({
      onMigrationEvent: (event) => {
        if (event.type === 'complete') migrated.push(event.modelName);
      },
    });
    await client.connect(testConfig);
    await forgetMigrationState(client);
    await cleanupTables(client, tables.oneToManyRequired);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  async function expectRelatedTableWritable(): Promise<void> {
    const updated = await client.db.Author.updateMany({ where: {}, data: { name: 'renamed' } });

    expect(updated.length).toBeGreaterThan(0);
    expect(updated.every((a) => a.name === 'renamed')).toBe(true);
  }

  test('nested create as the first operation migrates the related model', async () => {
    const post = await client.db.PostRequired.create({
      data: { title: 'first', author: { create: { name: 'Nested', email: uniqueEmail('nested') } } },
    });

    expect(post).not.toBeNull();
    expect(migrated).toContain('PostRequired');
    expect(migrated).toContain('Author');
    await expectRelatedTableWritable();
  });

  test('nested connect as the first operation migrates the related model', async () => {
    // Raw seed so the client under test stays un-migrated for Author
    const [[author]] = await client
      .getSurreal()!
      .query('CREATE author SET name = $name, email = $email', { name: 'Seed', email: uniqueEmail('seed') })
      .collect<[{ id: RecordId }[]]>();

    const post = await client.db.PostRequired.create({ data: { title: 'linked', author: { connect: author!.id } } });

    expect(post).not.toBeNull();
    expect(migrated).toContain('PostRequired');
    expect(migrated).toContain('Author');
    await expectRelatedTableWritable();
  });

  test('include as the first operation migrates the related model', async () => {
    await client.db.PostRequired.findMany({ include: { author: true } });

    expect(migrated).toContain('PostRequired');
    expect(migrated).toContain('Author');
  });

  test('array-mode $transaction with a nested write migrates the related model', async () => {
    await client.$transaction([
      client.db.PostRequired.create({
        data: { title: 'in tx', author: { create: { name: 'Tx', email: uniqueEmail('tx') } } },
      }),
    ]);

    expect(migrated).toContain('PostRequired');
    expect(migrated).toContain('Author');
    await expectRelatedTableWritable();
  });

  test('a query without relations does not migrate other models', async () => {
    await client.db.Author.findMany();

    expect(migrated).toEqual(['Author']);
  });
});
