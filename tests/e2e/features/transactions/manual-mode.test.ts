import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { CerialTransaction } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
  uniqueEmail,
} from '../../test-helper';

type ManualTxn = CerialTransaction & Record<string, any>;

describe('E2E Transactions: Manual Mode', () => {
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

  test('proxy: basic commit flow', async () => {
    const txn = (await client.$transaction()) as ManualTxn;
    const email = uniqueEmail();

    await txn.User.create({ data: { email, name: 'Commit Test', isActive: true } });
    await txn.commit();

    const found = await client.db.User.findMany();
    expect(found.length).toBe(1);
    expect(found[0]?.email).toBe(email);
  });

  test('proxy: cancel flow — nothing persisted', async () => {
    const txn = (await client.$transaction()) as ManualTxn;
    const email = uniqueEmail();

    await txn.User.create({ data: { email, name: 'Cancel Test', isActive: true } });
    await txn.cancel();

    const found = await client.db.User.findMany();
    expect(found.length).toBe(0);
  });

  test('proxy: dependent operations — user then post', async () => {
    const txn = (await client.$transaction()) as ManualTxn;
    const email = uniqueEmail();

    const user = await txn.User.create({ data: { email, name: 'Author', isActive: true } });
    await txn.Post.create({ data: { title: 'My Post', authorId: user.id } });
    await txn.commit();

    const users = await client.db.User.findMany();
    expect(users.length).toBe(1);
    const posts = await client.db.Post.findMany();
    expect(posts.length).toBe(1);
    expect(posts[0]?.title).toBe('My Post');
  });

  test('proxy: all CRUD methods — findMany, findOne, create, updateMany, deleteMany, count, exists', async () => {
    const txn = (await client.$transaction()) as ManualTxn;
    const email1 = uniqueEmail();
    const email2 = uniqueEmail();

    const _user1 = await txn.User.create({ data: { email: email1, name: 'User A', isActive: true } });
    const _user2 = await txn.User.create({ data: { email: email2, name: 'User B', isActive: false } });

    const found = await txn.User.findOne({ where: { email: email1 } });
    expect(found).toBeDefined();
    expect(found.email).toBe(email1);

    const all = await txn.User.findMany();
    expect(all.length).toBe(2);

    const updated = await txn.User.updateMany({
      where: { email: email1 },
      data: { name: 'Updated A' },
    });
    expect(updated.length).toBe(1);
    expect(updated[0].name).toBe('Updated A');

    const count = await txn.User.count();
    expect(count).toBe(2);

    const exists = await txn.User.exists({ email: email2 });
    expect(exists).toBe(true);

    const deleted = await txn.User.deleteMany({ where: { email: email1 } });
    expect(deleted).toBe(1);

    await txn.commit();

    const remaining = await client.db.User.findMany();
    expect(remaining.length).toBe(1);
    expect(remaining[0]?.email).toBe(email2);
  });

  test('txn option: basic commit', async () => {
    const txn = (await client.$transaction()) as ManualTxn;
    const email = uniqueEmail();

    await client.db.User.create({ data: { email, name: 'Txn Option', isActive: true }, txn });
    await txn.commit();

    const found = await client.db.User.findMany();
    expect(found.length).toBe(1);
    expect(found[0]?.email).toBe(email);
  });

  test('txn option: all methods — findMany, create, updateMany, deleteMany, count, exists', async () => {
    const txn = (await client.$transaction()) as ManualTxn;
    const email = uniqueEmail();

    await client.db.User.create({ data: { email, name: 'Option User', isActive: true }, txn });

    const all = await client.db.User.findMany({ txn });
    expect(all.length).toBe(1);

    await client.db.User.updateMany({
      where: { email },
      data: { name: 'Updated Option' },
      txn,
    });

    const count = await client.db.User.count(undefined, txn);
    expect(count).toBe(1);

    const exists = await client.db.User.exists({ email }, txn);
    expect(exists).toBe(true);

    const deleted = await client.db.User.deleteMany({ where: { email }, txn });
    expect(deleted).toBe(1);

    await txn.commit();

    const remaining = await client.db.User.findMany();
    expect(remaining.length).toBe(0);
  });

  test('mixed: both patterns in same txn — all committed', async () => {
    const txn = (await client.$transaction()) as ManualTxn;
    const email1 = uniqueEmail();
    const email2 = uniqueEmail();

    await txn.User.create({ data: { email: email1, name: 'Proxy User', isActive: true } });
    await client.db.User.create({ data: { email: email2, name: 'Option User', isActive: true }, txn });
    await txn.commit();

    const all = await client.db.User.findMany();
    expect(all.length).toBe(2);
  });

  test('mixed: both patterns cancel — both rolled back', async () => {
    const txn = (await client.$transaction()) as ManualTxn;

    await txn.User.create({ data: { email: uniqueEmail(), name: 'Proxy', isActive: true } });
    await client.db.User.create({ data: { email: uniqueEmail(), name: 'Option', isActive: true }, txn });
    await txn.cancel();

    const all = await client.db.User.findMany();
    expect(all.length).toBe(0);
  });

  test('edge: use-after-commit throws (proxy pattern)', async () => {
    const txn = (await client.$transaction()) as ManualTxn;
    await txn.commit();

    expect(() => {
      txn.User.create({ data: { email: uniqueEmail(), name: 'Stale', isActive: true } });
    }).toThrow('Transaction already ended');
  });

  test('edge: use-after-cancel throws (proxy pattern)', async () => {
    const txn = (await client.$transaction()) as ManualTxn;
    await txn.cancel();

    expect(() => {
      txn.User.create({ data: { email: uniqueEmail(), name: 'Stale', isActive: true } });
    }).toThrow('Transaction already ended');
  });

  test('edge: use-after-commit throws (txn option pattern)', async () => {
    const txn = (await client.$transaction()) as ManualTxn;
    await txn.commit();

    await expect(
      (async () => {
        await client.db.User.create({
          data: { email: uniqueEmail(), name: 'Stale', isActive: true },
          txn,
        });
      })(),
    ).rejects.toThrow();
  });

  test('edge: isolation — uncommitted data not visible outside txn', async () => {
    const txn = (await client.$transaction()) as ManualTxn;
    const email = uniqueEmail();

    await txn.User.create({ data: { email, name: 'Isolated', isActive: true } });

    const outsideView = await client.db.User.findMany({ where: { email } });
    expect(outsideView.length).toBe(0);

    await txn.commit();

    const afterCommit = await client.db.User.findMany({ where: { email } });
    expect(afterCommit.length).toBe(1);
    expect(afterCommit[0]?.email).toBe(email);
  });

  test('edge: nested create with txn option', async () => {
    const txn = (await client.$transaction()) as ManualTxn;
    const email = uniqueEmail();

    await client.db.User.create({
      data: {
        email,
        name: 'Nested Author',
        isActive: true,
        posts: {
          create: [{ title: 'Nested Post 1' }, { title: 'Nested Post 2' }],
        },
      },
      txn,
    });
    await txn.commit();

    const users = await client.db.User.findMany({ where: { email } });
    expect(users.length).toBe(1);
    const posts = await client.db.Post.findMany({ where: { authorId: users[0]!.id } });
    expect(posts.length).toBe(2);
  });

  test('edge: select with proxy pattern', async () => {
    const txn = (await client.$transaction()) as ManualTxn;
    const email = uniqueEmail();

    const user = await txn.User.create({
      data: { email, name: 'Select Proxy', isActive: true },
      select: { name: true, email: true },
    });

    await txn.commit();

    expect(user.name).toBe('Select Proxy');
    expect(user.email).toBe(email);
    expect(user.isActive).toBeUndefined();
  });

  test('edge: select with txn option pattern', async () => {
    const txn = (await client.$transaction()) as ManualTxn;
    const email = uniqueEmail();

    const user = await client.db.User.create({
      data: { email, name: 'Select Option', isActive: true },
      select: { name: true, email: true },
      txn,
    });

    await txn.commit();

    expect(user?.name).toBe('Select Option');
    expect(user?.email).toBe(email);
    expect((user as any)?.isActive).toBeUndefined();
  });

  test('edge: multiple models in same txn', async () => {
    const txn = (await client.$transaction()) as ManualTxn;
    const email = uniqueEmail();

    const user = await txn.User.create({ data: { email, name: 'Multi', isActive: true } });
    await txn.Post.create({ data: { title: 'Post A', authorId: user.id } });
    await txn.Tag.create({ data: { name: `tag-${email}` } });
    await txn.commit();

    const users = await client.db.User.findMany();
    expect(users.length).toBe(1);
    const posts = await client.db.Post.findMany();
    expect(posts.length).toBe(1);
    const tags = await client.db.Tag.findMany({ where: { name: `tag-${email}` } });
    expect(tags.length).toBe(1);
  });

  test('edge: state transitions — active → committed', async () => {
    const txn = (await client.$transaction()) as ManualTxn;
    expect(txn.state).toBe('active');

    await txn.commit();
    expect(txn.state).toBe('committed');
  });

  test('edge: state transitions — active → cancelled', async () => {
    const txn = (await client.$transaction()) as ManualTxn;
    expect(txn.state).toBe('active');

    await txn.cancel();
    expect(txn.state).toBe('cancelled');
  });
});
