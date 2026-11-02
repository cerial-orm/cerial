/**
 * Integration test: cascades follow cycles row by row and refuse past the depth limit
 *
 * Inside an SDK transaction a THROW does not stop the rest of the script, so a refused deep delete that is
 * caught and committed must still leave every row in place. Compiled scripts run on a throwaway database,
 * created and removed here, in a callback-shaped transaction and in a manual one.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Surreal } from 'surrealdb';
import { buildDeleteUniqueWithCascade, buildDeleteWithCascade } from '../../src/query/builders';
import { executeQuery } from '../../src/query/executor';
import type { CompiledQuery } from '../../src/query/compile/types';
import { parseModelRegistry } from '../test-helpers';

const URL = 'http://127.0.0.1:8000';
const NAMESPACE = 'main';
const DATABASE = `cerial_cascade_cycle_${Date.now()}`;
const LIMIT = 16;

const registry = parseModelRegistry(`
model Node {
  id Record @id
  email Email? @unique
  parentId Record?
  parent Relation? @field(parentId) @model(Node) @onDelete(Cascade) @key(tree)
  children Relation[] @model(Node) @key(tree)
}

model Branch {
  id Record @id
  leftId Record?
  left Relation? @field(leftId) @model(Branch) @onDelete(Cascade) @key(leftTree)
  lefts Relation[] @model(Branch) @key(leftTree)
  rightId Record?
  right Relation? @field(rightId) @model(Branch) @onDelete(Cascade) @key(rightTree)
  rights Relation[] @model(Branch) @key(rightTree)
}

model Ping {
  id Record @id
  pongId Record?
  pong Relation? @field(pongId) @model(Pong) @onDelete(Cascade) @key(pp)
  pongs Relation[] @model(Pong) @key(qq)
}

model Pong {
  id Record @id
  pingId Record?
  ping Relation? @field(pingId) @model(Ping) @onDelete(Cascade) @key(qq)
  pings Relation[] @model(Ping) @key(pp)
}
`);

const admin = new Surreal();
let db: Surreal;

beforeAll(async () => {
  await admin.connect(`${URL}/rpc`);
  await admin.signin({ username: 'root', password: 'root' });
  await admin.use({ namespace: NAMESPACE });
  await admin.query(`DEFINE DATABASE ${DATABASE};`);

  db = new Surreal();
  // An SDK transaction needs a WebSocket connection
  await db.connect('ws://127.0.0.1:8000/rpc');
  await db.signin({ username: 'root', password: 'root' });
  await db.use({ namespace: NAMESPACE, database: DATABASE });
  await db
    .query(
      'DEFINE TABLE node SCHEMALESS; DEFINE TABLE branch SCHEMALESS; DEFINE TABLE ping SCHEMALESS; DEFINE TABLE pong SCHEMALESS;',
    )
    .collect();
});

afterAll(async () => {
  try {
    await db.close();
    await admin.query(`REMOVE DATABASE IF EXISTS ${DATABASE};`);
  } finally {
    await admin.close();
  }
});

const count = async (table: string): Promise<number> => {
  const [rows] = await db.query<[{ count: number }[]]>(`SELECT count() FROM ${table} GROUP ALL`).collect();

  return rows![0]?.count ?? 0;
};

const reset = async (): Promise<void> => {
  await db.query('DELETE node; DELETE branch; DELETE ping; DELETE pong;').collect();
};

/** One node per level: n0 is the root and n<k> hangs under n<k-1> */
const seedChain = async (levels: number): Promise<void> => {
  await reset();
  const statements = ['CREATE node:n0'];
  for (let k = 1; k <= levels; k++) statements.push(`CREATE node:n${k} SET parentId = node:n${k - 1}`);
  await db.query(statements.join(';')).collect();
};

/** 1 where the level's node still exists, per level */
const levelsLeft = async (levels: number): Promise<number[]> => {
  const out: number[] = [];
  for (let k = 0; k <= levels; k++) {
    const [rows] = await db.query<[{ id: unknown }[]]>(`SELECT id FROM node:n${k}`).collect();
    out.push(rows!.length);
  }

  return out;
};

type Mode = 'callback' | 'manual';

/**
 * Runs the script in an SDK transaction, catches a refusal, commits, and returns the refusal text. Callback
 * mode is the client's own shape: begin, run the callback, commit, cancel only if the callback throws.
 * Manual mode hands the transaction to the caller, who commits it.
 */
const inTransaction = async (mode: Mode, query: CompiledQuery): Promise<string | undefined> => {
  const txn = await db.beginTransaction();
  let refusal: string | undefined;

  const body = async (): Promise<void> => {
    try {
      // executeQuery recognises a transaction by its class; its parameter type names only the connection
      await executeQuery(txn as unknown as Surreal, query);
    } catch (err) {
      refusal = err instanceof Error ? err.message : String(err);
    }
  };

  if (mode === 'manual') {
    await body();
    await txn.commit();

    return refusal;
  }

  try {
    await body();
    await txn.commit();
  } catch (err) {
    await txn.cancel();
    throw err;
  }

  return refusal;
};

const deleteNode = (id: string): CompiledQuery =>
  buildDeleteUniqueWithCascade(registry.Node!, { id }, registry, false, true);

describe.each(['callback', 'manual'] as const)('%s transaction', (mode) => {
  test('a tree exactly at the limit deletes every level and leaves a sibling tree', async () => {
    await seedChain(LIMIT);
    await db.query('CREATE node:s0; CREATE node:s1 SET parentId = node:s0;').collect();

    const refusal = await inTransaction(mode, deleteNode('n0'));

    expect(refusal).toBeUndefined();
    expect(await levelsLeft(LIMIT)).toEqual(Array(LIMIT + 1).fill(0));
    expect(await count('node')).toBe(2);
  });

  test('a tree one level past the limit is refused and every level stays', async () => {
    await seedChain(LIMIT + 1);

    const refusal = await inTransaction(mode, deleteNode('n0'));

    expect(refusal).toContain(`cascade deeper than ${LIMIT} levels at Node (Node > Node`);
    expect(await levelsLeft(LIMIT + 1)).toEqual(Array(LIMIT + 2).fill(1));
  });

  test('deleteMany past the limit is refused and every level stays', async () => {
    await seedChain(LIMIT + 1);

    const refusal = await inTransaction(mode, buildDeleteWithCascade(registry.Node!, { id: 'n0' }, registry, true));

    expect(refusal).toContain(`cascade deeper than ${LIMIT} levels at Node`);
    expect(await levelsLeft(LIMIT + 1)).toEqual(Array(LIMIT + 2).fill(1));
  });

  test('deleting a node below the deep part succeeds: the limit counts from the deleted row', async () => {
    await seedChain(LIMIT + 1);

    const refusal = await inTransaction(mode, deleteNode('n1'));

    expect(refusal).toBeUndefined();
    expect(await levelsLeft(LIMIT + 1)).toEqual([1, ...Array(LIMIT + 1).fill(0)]);
  });
});

describe('cycles', () => {
  test('a self-referential tree of depth three with branches deletes from the root', async () => {
    await reset();
    await db
      .query(
        `CREATE node:r; CREATE node:a SET parentId = node:r; CREATE node:b SET parentId = node:r;
         CREATE node:a1 SET parentId = node:a; CREATE node:a2 SET parentId = node:a;
         CREATE node:a11 SET parentId = node:a1; CREATE node:b1 SET parentId = node:b;
         CREATE node:other; CREATE node:other1 SET parentId = node:other;`,
      )
      .collect();

    expect(await inTransaction('callback', deleteNode('r'))).toBeUndefined();
    expect(await count('node')).toBe(2);
  });

  test('a two-row data cycle terminates, deletes both rows and what hangs below', async () => {
    await reset();
    await db
      .query(
        `CREATE node:x SET parentId = node:y; CREATE node:y SET parentId = node:x;
         CREATE node:z SET parentId = node:y; CREATE node:keep;`,
      )
      .collect();

    expect(await inTransaction('callback', deleteNode('x'))).toBeUndefined();
    expect(await count('node')).toBe(1);
  });

  test('a data cycle is not mistaken for a tree past the limit, outside a transaction too', async () => {
    await reset();
    await db.query('CREATE node:x SET parentId = node:y; CREATE node:y SET parentId = node:x;').collect();

    await executeQuery(db, buildDeleteUniqueWithCascade(registry.Node!, { id: 'x' }, registry, false));
    expect(await count('node')).toBe(0);
  });

  test('a mutual cycle of two models deletes each row once', async () => {
    await reset();
    await db
      .query(
        `CREATE ping:p1 SET pongId = pong:q1; CREATE pong:q1 SET pingId = ping:p1;
         CREATE pong:q2 SET pingId = ping:p1; CREATE ping:p2 SET pongId = pong:q2;
         CREATE pong:q3 SET pingId = ping:p2; CREATE ping:keep; CREATE pong:keep;`,
      )
      .collect();

    const refusal = await inTransaction('manual', buildDeleteWithCascade(registry.Ping!, { id: 'p1' }, registry, true));

    expect(refusal).toBeUndefined();
    expect([await count('ping'), await count('pong')]).toEqual([1, 1]);
  });

  test('a refusal outside a transaction rolls back and leaves every level', async () => {
    await seedChain(LIMIT + 1);

    await expect(
      executeQuery(db, buildDeleteUniqueWithCascade(registry.Node!, { id: 'n0' }, registry, false)),
    ).rejects.toThrow();
    expect(await levelsLeft(LIMIT + 1)).toEqual(Array(LIMIT + 2).fill(1));
  });
});

describe('two cascading self-relations', () => {
  const deleteBranch = (id: string): CompiledQuery =>
    buildDeleteUniqueWithCascade(registry.Branch!, { id }, registry, false, true);

  /** b0 is the root and b<k> hangs under b<k-1> through the left relation when k is odd, the right one when even */
  const seedAlternating = async (levels: number): Promise<void> => {
    await reset();
    const statements = ['CREATE branch:b0'];
    for (let k = 1; k <= levels; k++) {
      statements.push(`CREATE branch:b${k} SET ${k % 2 ? 'leftId' : 'rightId'} = branch:b${k - 1}`);
    }
    await db.query(statements.join(';')).collect();
  };

  const branchesLeft = async (levels: number): Promise<number[]> => {
    const out: number[] = [];
    for (let k = 0; k <= levels; k++) {
      const [rows] = await db.query<[{ id: unknown }[]]>(`SELECT id FROM branch:b${k}`).collect();
      out.push(rows!.length);
    }

    return out;
  };

  test.each(['callback', 'manual'] as const)(
    'a branching tree over both relations deletes fully in a %s transaction',
    async (mode) => {
      await reset();
      await db
        .query(
          `CREATE branch:r; CREATE branch:l1 SET leftId = branch:r; CREATE branch:r1 SET rightId = branch:r;
         CREATE branch:l2 SET rightId = branch:l1; CREATE branch:r2 SET leftId = branch:r1;
         CREATE branch:l3 SET leftId = branch:l2; CREATE branch:r3 SET rightId = branch:r2;
         CREATE branch:s; CREATE branch:s1 SET leftId = branch:s; CREATE branch:s2 SET rightId = branch:s1;`,
        )
        .collect();

      expect(await inTransaction(mode, deleteBranch('r'))).toBeUndefined();
      expect(await count('branch')).toBe(3);
      const [kept] = await db.query<[{ id: unknown }[]]>('SELECT id FROM branch:s, branch:s1, branch:s2').collect();
      expect(kept).toHaveLength(3);
    },
  );

  test('a row reached through both relations is deleted once and the delete ends', async () => {
    await reset();
    await db
      .query(
        `CREATE branch:r; CREATE branch:m SET leftId = branch:r, rightId = branch:r;
         CREATE branch:m1 SET leftId = branch:m, rightId = branch:m;`,
      )
      .collect();

    expect(await inTransaction('callback', deleteBranch('r'))).toBeUndefined();
    expect(await count('branch')).toBe(0);
  });

  test('a data cycle across the two relations terminates', async () => {
    await reset();
    await db
      .query(
        'CREATE branch:x SET leftId = branch:y; CREATE branch:y SET rightId = branch:x; CREATE branch:z SET leftId = branch:y; CREATE branch:keep;',
      )
      .collect();

    expect(await inTransaction('callback', deleteBranch('x'))).toBeUndefined();
    expect(await count('branch')).toBe(1);
  });

  test.each(['callback', 'manual'] as const)(
    'a tree at the limit deletes every level in a %s transaction',
    async (mode) => {
      await seedAlternating(LIMIT);

      expect(await inTransaction(mode, deleteBranch('b0'))).toBeUndefined();
      expect(await branchesLeft(LIMIT)).toEqual(Array(LIMIT + 1).fill(0));
    },
  );

  test.each(['callback', 'manual'] as const)(
    'a tree one level past the limit is refused and every level stays in a %s transaction',
    async (mode) => {
      await seedAlternating(LIMIT + 1);

      const refusal = await inTransaction(mode, deleteBranch('b0'));

      expect(refusal).toContain(`cascade deeper than ${LIMIT} levels at Branch (Branch > Branch`);
      expect(await branchesLeft(LIMIT + 1)).toEqual(Array(LIMIT + 2).fill(1));
    },
  );

  test('a refusal outside a transaction leaves every level', async () => {
    await seedAlternating(LIMIT + 1);

    await expect(
      executeQuery(db, buildDeleteUniqueWithCascade(registry.Branch!, { id: 'b0' }, registry, false)),
    ).rejects.toThrow();
    expect(await branchesLeft(LIMIT + 1)).toEqual(Array(LIMIT + 2).fill(1));
  });
});
