/**
 * Integration test: a refused Restrict delete leaves every row in place, even when the transaction commits
 *
 * Inside an SDK transaction a THROW does not stop the rest of the script, so a callback that catches the
 * refusal and commits used to lose the parent while its child stayed. Each test runs on a throwaway
 * database, created and removed here.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { CerialId } from 'cerial';
import { Surreal } from 'surrealdb';
import { buildDeleteUniqueWithCascade, buildDeleteWithCascade } from '../../src/query/builders';
import { executeQuery } from '../../src/query/executor';
import { CerialClient } from '../e2e/generated/client';
import { parseModelRegistry } from '../test-helpers';

const URL = 'http://127.0.0.1:8000';
const NAMESPACE = 'main';
const STAMP = Date.now();
const CLIENT_DB = `cerial_restrict_guard_${STAMP}`;
const SCRIPT_DB = `cerial_restrict_guard_script_${STAMP}`;

const admin = new Surreal();

beforeAll(async () => {
  await admin.connect(`${URL}/rpc`);
  await admin.signin({ username: 'root', password: 'root' });
  await admin.use({ namespace: NAMESPACE });
  await admin.query(`DEFINE DATABASE ${CLIENT_DB}; DEFINE DATABASE ${SCRIPT_DB};`);
});

afterAll(async () => {
  try {
    await admin.query(`REMOVE DATABASE IF EXISTS ${CLIENT_DB}; REMOVE DATABASE IF EXISTS ${SCRIPT_DB};`);
  } finally {
    await admin.close();
  }
});

describe('Restrict at depth one through the generated client', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = new CerialClient();
    await client.connect({
      url: URL,
      namespace: NAMESPACE,
      database: CLIENT_DB,
      auth: { username: 'root', password: 'root' },
    });
  });

  afterAll(async () => {
    await client.disconnect();
  });

  const counts = async (): Promise<[number, number]> => [
    await client.db.Department.count(),
    await client.db.Employee.count(),
  ];

  const seed = async (withEmployee: boolean): Promise<CerialId<string>> => {
    await client.db.Employee.deleteMany({ where: {} });
    await client.db.Department.deleteMany({ where: {} });
    const dept = await client.db.Department.create({ data: { name: 'ops' } });
    if (withEmployee) await client.db.Employee.create({ data: { name: 'ann', departmentId: dept.id } });

    return dept.id;
  };

  test('callback mode: the refusal is caught, the commit succeeds and nothing is gone', async () => {
    const id = await seed(true);
    let refused = false;

    await client.$transaction(async (tx) => {
      try {
        await tx.Department.deleteUnique({ where: { id } });
      } catch {
        refused = true;
      }
    });

    expect(refused).toBe(true);
    expect(await counts()).toEqual([1, 1]);
  });

  test('manual mode: the refusal is caught, the commit succeeds and nothing is gone', async () => {
    const id = await seed(true);
    const txn = await client.$transaction();
    let refused = false;

    try {
      await txn.Department.deleteUnique({ where: { id } });
    } catch {
      refused = true;
    }
    await txn.commit();

    expect(refused).toBe(true);
    expect(await counts()).toEqual([1, 1]);
  });

  test('callback mode: deleteMany refused by a child leaves the parent', async () => {
    await seed(true);
    let refused = false;

    await client.$transaction(async (tx) => {
      try {
        await tx.Department.deleteMany({ where: {} });
      } catch {
        refused = true;
      }
    });

    expect(refused).toBe(true);
    expect(await counts()).toEqual([1, 1]);
  });

  test('outside a transaction the refusal leaves every row', async () => {
    const id = await seed(true);

    await expect((async () => client.db.Department.deleteUnique({ where: { id } }))()).rejects.toThrow();
    expect(await counts()).toEqual([1, 1]);
  });

  test('callback mode: without a child the delete goes through', async () => {
    const id = await seed(false);

    await client.$transaction(async (tx) => {
      await tx.Department.deleteUnique({ where: { id } });
    });

    expect(await counts()).toEqual([0, 0]);
  });

  test('manual mode: without a child the delete goes through', async () => {
    const id = await seed(false);
    const txn = await client.$transaction();
    await txn.Department.deleteUnique({ where: { id } });
    await txn.commit();

    expect(await counts()).toEqual([0, 0]);
  });
});

describe('Restrict at depth two, compiled scripts run in an SDK transaction', () => {
  const registry = parseModelRegistry(`
model Boss {
  id Record @id
  email Email @unique
  teams Relation[] @model(Team)
}

model Team {
  id Record @id
  bossId Record
  boss Relation @field(bossId) @model(Boss)
  members Relation[] @model(Member)
  badges Relation[] @model(Badge)
}

model Member {
  id Record @id
  teamId Record?
  team Relation? @field(teamId) @model(Team) @onDelete(Restrict)
}

model Badge {
  id Record @id
  teamId Record
  team Relation @field(teamId) @model(Team)
}
`);

  let db: Surreal;

  beforeAll(async () => {
    db = new Surreal();
    // An SDK transaction needs a WebSocket connection
    await db.connect('ws://127.0.0.1:8000/rpc');
    await db.signin({ username: 'root', password: 'root' });
    await db.use({ namespace: NAMESPACE, database: SCRIPT_DB });
    await db
      .query(
        'DEFINE TABLE boss SCHEMALESS; DEFINE TABLE team SCHEMALESS; DEFINE TABLE member SCHEMALESS; DEFINE TABLE badge SCHEMALESS;',
      )
      .collect();
  });

  afterAll(async () => {
    await db.close();
  });

  const count = async (table: string): Promise<number> => {
    const [rows] = await db.query<[{ count: number }[]]>(`SELECT count() FROM ${table} GROUP ALL`).collect();

    return rows![0]?.count ?? 0;
  };

  const seed = async (withMember: boolean): Promise<void> => {
    await db.query('DELETE boss; DELETE team; DELETE member; DELETE badge;').collect();
    await db.query("CREATE boss:b1 SET email = 'a@example.com'; CREATE team:t1 SET bossId = boss:b1;").collect();
    await db.query('CREATE badge:g1 SET teamId = team:t1; CREATE team:t2 SET bossId = boss:b1;').collect();
    if (withMember) await db.query('CREATE member:m1 SET teamId = team:t1;').collect();
  };

  const levels = async (): Promise<number[]> => [
    await count('boss'),
    await count('team'),
    await count('badge'),
    await count('member'),
  ];

  const inTransaction = async (query: { text: string; vars: Record<string, unknown> }): Promise<boolean> => {
    const txn = await db.beginTransaction();
    let refused = false;

    try {
      // executeQuery recognises a transaction by its class; its parameter type names only the connection
      await executeQuery(txn as unknown as Surreal, query);
    } catch {
      refused = true;
    }
    await txn.commit();

    return refused;
  };

  test('deleteMany: the refusal is caught, the commit succeeds and every level is intact', async () => {
    await seed(true);
    const refused = await inTransaction(buildDeleteWithCascade(registry.Boss!, {}, registry, true));

    expect(refused).toBe(true);
    expect(await levels()).toEqual([1, 2, 1, 1]);
  });

  test('deleteUnique by id: the refusal is caught, the commit succeeds and every level is intact', async () => {
    await seed(true);
    const refused = await inTransaction(
      buildDeleteUniqueWithCascade(registry.Boss!, { id: 'b1' }, registry, true, true),
    );

    expect(refused).toBe(true);
    expect(await levels()).toEqual([1, 2, 1, 1]);
  });

  test('deleteUnique by a unique field: the refusal leaves every level intact', async () => {
    await seed(true);
    const query = buildDeleteUniqueWithCascade(registry.Boss!, { email: 'a@example.com' }, registry, true, true);
    const refused = await inTransaction(query);

    expect(refused).toBe(true);
    expect(await levels()).toEqual([1, 2, 1, 1]);
  });

  test('without a member the same delete removes every level', async () => {
    await seed(false);
    const refused = await inTransaction(buildDeleteWithCascade(registry.Boss!, {}, registry, true));

    expect(refused).toBe(false);
    expect(await levels()).toEqual([0, 0, 0, 0]);
  });

  test('deleteUnique with no match deletes nothing at any depth', async () => {
    await seed(false);
    const query = buildDeleteUniqueWithCascade(registry.Boss!, { email: 'none@example.com' }, registry, true, true);
    const refused = await inTransaction(query);

    expect(refused).toBe(false);
    expect(await levels()).toEqual([1, 2, 1, 0]);
  });

  test('outside a transaction the refusal leaves every level intact', async () => {
    await seed(true);
    const query = buildDeleteWithCascade(registry.Boss!, {}, registry);

    await expect(executeQuery(db, query)).rejects.toThrow();
    expect(await levels()).toEqual([1, 2, 1, 1]);
  });
});
