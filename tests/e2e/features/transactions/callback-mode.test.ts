import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { isCerialId } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
  uniqueEmail,
} from '../../test-helper';

describe('E2E Transactions: Callback Mode', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.basics);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.basics);
  });

  test('basic callback with single create', async () => {
    const email = uniqueEmail();

    const user = await client.$transaction(async (tx) => {
      return await tx.User.create({ data: { email, name: 'Alice', isActive: true } });
    });

    expect(user).toBeDefined();
    expect(user.email).toBe(email);
    expect(user.name).toBe('Alice');
    expect(user.isActive).toBe(true);
    expect(isCerialId(user.id)).toBe(true);

    const found = await client.db.User.findOne({ where: { email } });
    expect(found).toBeDefined();
    expect(found!.email).toBe(email);
  });

  test('callback with dependent queries — create user then post with user.id', async () => {
    const email = uniqueEmail();

    const result = await client.$transaction(async (tx) => {
      const user = await tx.User.create({ data: { email, name: 'Bob', isActive: true } });
      const post = await tx.Post.create({ data: { title: 'Hello World', authorId: user.id } });

      return { user, post };
    });

    expect(result.user).toBeDefined();
    expect(result.user.email).toBe(email);
    expect(result.post).toBeDefined();
    expect(result.post.title).toBe('Hello World');

    const users = await client.db.User.findMany();
    expect(users.length).toBe(1);
    const posts = await client.db.Post.findMany();
    expect(posts.length).toBe(1);
  });

  test('callback return value is the $transaction result', async () => {
    const result = await client.$transaction(async (tx) => {
      await tx.User.create({ data: { email: uniqueEmail(), name: 'Return Test', isActive: true } });

      return 42;
    });

    expect(result).toBe(42);
  });

  test('callback can return complex objects', async () => {
    const result = await client.$transaction(async (tx) => {
      const user = await tx.User.create({
        data: { email: uniqueEmail(), name: 'Complex', isActive: true },
      });

      return { userId: user.id, timestamp: Date.now(), tags: ['a', 'b'] };
    });

    expect(isCerialId(result.userId)).toBe(true);
    expect(typeof result.timestamp).toBe('number');
    expect(result.tags).toEqual(['a', 'b']);
  });

  test('throw inside callback rolls back all changes', async () => {
    const email = uniqueEmail();

    await expect(
      client.$transaction(async (tx) => {
        await tx.User.create({ data: { email, name: 'Rollback Test', isActive: true } });
        throw new Error('Intentional rollback');
      }),
    ).rejects.toThrow('Intentional rollback');

    const users = await client.db.User.findMany({ where: { email } });
    expect(users.length).toBe(0);
  });

  test('timeout option cancels long-running callback', async () => {
    const email = uniqueEmail();

    await expect(
      client.$transaction(
        async (tx) => {
          await tx.User.create({ data: { email, name: 'Timeout Test', isActive: true } });
          await new Promise((resolve) => setTimeout(resolve, 300));

          return 'should not reach';
        },
        { timeout: 50 },
      ),
    ).rejects.toThrow('Transaction timeout');

    const users = await client.db.User.findMany({ where: { email } });
    expect(users.length).toBe(0);
  });

  test('mixed model operations in callback', async () => {
    const email1 = uniqueEmail();
    const email2 = uniqueEmail();

    const result = await client.$transaction(async (tx) => {
      const user1 = await tx.User.create({ data: { email: email1, name: 'User One', isActive: true } });
      const user2 = await tx.User.create({ data: { email: email2, name: 'User Two', isActive: false } });
      const updated = await tx.User.updateMany({
        where: { email: email1 },
        data: { name: 'Updated User One' },
      });
      const posts = await tx.Post.findMany();

      return { user1, user2, updated, posts };
    });

    expect(result.user1.email).toBe(email1);
    expect(result.user2.email).toBe(email2);
    expect(result.updated.length).toBe(1);
    expect(result.updated[0].name).toBe('Updated User One');
    expect(result.posts.length).toBe(0);
  });

  test('nested create inside callback', async () => {
    const email = uniqueEmail();

    const user = await client.$transaction(async (tx) => {
      return await tx.User.create({
        data: {
          email,
          name: 'With Posts',
          isActive: true,
          posts: {
            create: [{ title: 'Post 1' }, { title: 'Post 2' }],
          },
        },
      });
    });

    expect(user).toBeDefined();
    expect(user.email).toBe(email);

    const posts = await client.db.Post.findMany({ where: { authorId: user.id } });
    expect(posts.length).toBe(2);
    const titles = posts.map((p: { title: string }) => p.title).sort();
    expect(titles).toEqual(['Post 1', 'Post 2']);
  });

  test('select inside callback', async () => {
    const email = uniqueEmail();

    const user = await client.$transaction(async (tx) => {
      return await tx.User.create({
        data: { email, name: 'Select Test', isActive: true },
        select: { name: true, email: true },
      });
    });

    expect(user).toBeDefined();
    expect(user.name).toBe('Select Test');
    expect(user.email).toBe(email);
    expect(user.isActive).toBeUndefined();
    expect(user.createdAt).toBeUndefined();
  });

  test('count and exists inside callback', async () => {
    await client.db.User.create({
      data: { email: uniqueEmail(), name: 'Existing', isActive: true },
    });

    const result = await client.$transaction(async (tx) => {
      const count = await tx.User.count();
      const exists = await tx.User.exists();
      const notExists = await tx.User.exists({ email: 'nonexistent@test.com' });

      return { count, exists, notExists };
    });

    expect(result.count).toBe(1);
    expect(result.exists).toBe(true);
    expect(result.notExists).toBe(false);
  });

  test('nesting prevention — $transaction inside callback throws', async () => {
    await expect(
      client.$transaction(async (tx) => {
        tx.$transaction;
      }),
    ).rejects.toThrow('Nested transactions are not supported');
  });

  test('empty callback commits successfully and returns undefined', async () => {
    const result = await client.$transaction(async () => {});

    expect(result).toBeUndefined();
  });

  test('async callback with delay works correctly', async () => {
    const email = uniqueEmail();

    const user = await client.$transaction(async (tx) => {
      const created = await tx.User.create({
        data: { email, name: 'Async Test', isActive: true },
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      return created;
    });

    expect(user).toBeDefined();
    expect(user.email).toBe(email);

    const found = await client.db.User.findMany();
    expect(found.length).toBe(1);
  });
});
