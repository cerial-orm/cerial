import type { CerialId as AnyCerialId } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../../test-helper';

type CerialId = AnyCerialId<string>;

export const ACTIONS = ['Cascade', 'Restrict', 'SetNull', 'SetNone', 'NoAction'] as const;
export type Action = (typeof ACTIONS)[number];
export type Depth = 2 | 3;

/** The cascade limit the delete builder refuses past */
export const DEPTH_LIMIT = 16;

export interface LeafState {
  exists: boolean;
  /** The leaf's foreign key: an id, null (cleared by SetNull), or undefined (cleared by SetNone) */
  fk: CerialId | null | undefined;
}

/** One model that ends a chain, hung off DdOne (depth two) or DdTwo (depth three) */
export interface Leaf {
  create(parent: CerialId): Promise<CerialId>;
  state(id: CerialId): Promise<LeafState>;
  count(): PromiseLike<number>;
}

export interface Chain {
  rootId: CerialId;
  rootCode: string;
  oneId: CerialId;
  twoId: CerialId | undefined;
  leafId: CerialId;
}

export const connectClient = async (): Promise<CerialClient> => {
  const client = createTestClient();
  await client.connect(testConfig);
  await cleanupTables(client, tables.onDeleteDeep);

  return client;
};

export const resetTables = (client: CerialClient): Promise<void> => truncateTables(client, tables.onDeleteDeep);

/** Typed per model: the ten leaf delegates share no common create signature */
export function leafOf(client: CerialClient, depth: Depth, action: Action): Leaf {
  const db = client.db;
  const two = {
    Cascade: {
      create: async (p: CerialId) =>
        (await db.DdAtTwoCascade.create({ data: { name: 'leaf', one: { connect: p } } })).id,
      state: async (id: CerialId) => {
        const row = await db.DdAtTwoCascade.findOne({ where: { id } });

        return { exists: row !== null, fk: row?.oneId };
      },
      count: () => db.DdAtTwoCascade.count(),
    },
    Restrict: {
      create: async (p: CerialId) =>
        (await db.DdAtTwoRestrict.create({ data: { name: 'leaf', one: { connect: p } } })).id,
      state: async (id: CerialId) => {
        const row = await db.DdAtTwoRestrict.findOne({ where: { id } });

        return { exists: row !== null, fk: row?.oneId };
      },
      count: () => db.DdAtTwoRestrict.count(),
    },
    SetNull: {
      create: async (p: CerialId) =>
        (await db.DdAtTwoSetNull.create({ data: { name: 'leaf', one: { connect: p } } })).id,
      state: async (id: CerialId) => {
        const row = await db.DdAtTwoSetNull.findOne({ where: { id } });

        return { exists: row !== null, fk: row?.oneId };
      },
      count: () => db.DdAtTwoSetNull.count(),
    },
    SetNone: {
      create: async (p: CerialId) =>
        (await db.DdAtTwoSetNone.create({ data: { name: 'leaf', one: { connect: p } } })).id,
      state: async (id: CerialId) => {
        const row = await db.DdAtTwoSetNone.findOne({ where: { id } });

        return { exists: row !== null, fk: row?.oneId };
      },
      count: () => db.DdAtTwoSetNone.count(),
    },
    NoAction: {
      create: async (p: CerialId) =>
        (await db.DdAtTwoNoAction.create({ data: { name: 'leaf', one: { connect: p } } })).id,
      state: async (id: CerialId) => {
        const row = await db.DdAtTwoNoAction.findOne({ where: { id } });

        return { exists: row !== null, fk: row?.oneId };
      },
      count: () => db.DdAtTwoNoAction.count(),
    },
  } satisfies Record<Action, Leaf>;
  const three = {
    Cascade: {
      create: async (p: CerialId) =>
        (await db.DdAtThreeCascade.create({ data: { name: 'leaf', two: { connect: p } } })).id,
      state: async (id: CerialId) => {
        const row = await db.DdAtThreeCascade.findOne({ where: { id } });

        return { exists: row !== null, fk: row?.twoId };
      },
      count: () => db.DdAtThreeCascade.count(),
    },
    Restrict: {
      create: async (p: CerialId) =>
        (await db.DdAtThreeRestrict.create({ data: { name: 'leaf', two: { connect: p } } })).id,
      state: async (id: CerialId) => {
        const row = await db.DdAtThreeRestrict.findOne({ where: { id } });

        return { exists: row !== null, fk: row?.twoId };
      },
      count: () => db.DdAtThreeRestrict.count(),
    },
    SetNull: {
      create: async (p: CerialId) =>
        (await db.DdAtThreeSetNull.create({ data: { name: 'leaf', two: { connect: p } } })).id,
      state: async (id: CerialId) => {
        const row = await db.DdAtThreeSetNull.findOne({ where: { id } });

        return { exists: row !== null, fk: row?.twoId };
      },
      count: () => db.DdAtThreeSetNull.count(),
    },
    SetNone: {
      create: async (p: CerialId) =>
        (await db.DdAtThreeSetNone.create({ data: { name: 'leaf', two: { connect: p } } })).id,
      state: async (id: CerialId) => {
        const row = await db.DdAtThreeSetNone.findOne({ where: { id } });

        return { exists: row !== null, fk: row?.twoId };
      },
      count: () => db.DdAtThreeSetNone.count(),
    },
    NoAction: {
      create: async (p: CerialId) =>
        (await db.DdAtThreeNoAction.create({ data: { name: 'leaf', two: { connect: p } } })).id,
      state: async (id: CerialId) => {
        const row = await db.DdAtThreeNoAction.findOne({ where: { id } });

        return { exists: row !== null, fk: row?.twoId };
      },
      count: () => db.DdAtThreeNoAction.count(),
    },
  } satisfies Record<Action, Leaf>;

  return depth === 2 ? two[action] : three[action];
}

let seeded = 0;

/** root -> one -> (two ->) one leaf of the given action, each row connected to the one above */
export async function seedChain(client: CerialClient, depth: Depth, action: Action): Promise<Chain> {
  const rootCode = `root-${seeded++}`;
  const root = await client.db.DdRoot.create({ data: { name: 'root', code: rootCode } });
  const one = await client.db.DdOne.create({ data: { name: 'one', root: { connect: root.id } } });
  const leaf = leafOf(client, depth, action);

  if (depth === 2)
    return { rootId: root.id, rootCode, oneId: one.id, twoId: undefined, leafId: await leaf.create(one.id) };

  const two = await client.db.DdTwo.create({ data: { name: 'two', one: { connect: one.id } } });

  return { rootId: root.id, rootCode, oneId: one.id, twoId: two.id, leafId: await leaf.create(two.id) };
}

/** Row count per level, root first: [root, one, leaf] at depth two and [root, one, two, leaf] at depth three */
export async function levelCounts(client: CerialClient, depth: Depth, action: Action): Promise<number[]> {
  const base = [await client.db.DdRoot.count(), await client.db.DdOne.count()];
  if (depth === 3) base.push(await client.db.DdTwo.count());
  base.push(await leafOf(client, depth, action).count());

  return base;
}

/** The refusal a blocked delete raises, or undefined when the delete went through */
export async function refusalOf(run: () => PromiseLike<unknown>): Promise<Error | undefined> {
  try {
    await run();
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }

  return undefined;
}

/** A DdTree chain: n0 is the root and n<k> hangs under n<k-1>. Returns the ids, root first */
export async function seedTreeChain(client: CerialClient, levels: number): Promise<CerialId[]> {
  const ids: CerialId[] = [];
  const root = await client.db.DdTree.create({ data: { name: 'n0' } });
  ids.push(root.id);
  for (let k = 1; k <= levels; k++) {
    const node = await client.db.DdTree.create({ data: { name: `n${k}`, parent: { connect: ids[k - 1]! } } });
    ids.push(node.id);
  }

  return ids;
}
