import type { CerialQueryPromise } from 'cerial';
import type { CerialClient } from '../../test-helper';

/** The model accessors a cell needs. `client.db` and a transaction client both satisfy it. */
export type Models = Pick<CerialClient['db'], 'User' | 'Tag'>;

export const MODES = ['plain', 'array', 'callback', 'manual'] as const;
export type Mode = (typeof MODES)[number];

/**
 * Runs one query through the given path. `build` receives the model accessors of that path and
 * returns the query, so the same call is written once and driven four ways. Array mode executes the
 * compiled query; callback and manual modes run the runtime path on a shared transaction connection.
 */
export async function runIn<T>(
  client: CerialClient,
  mode: Mode,
  build: (m: Models) => CerialQueryPromise<T>,
): Promise<T> {
  switch (mode) {
    case 'plain':
      return build(client.db);
    case 'array': {
      const [result] = await client.$transaction([build(client.db)]);

      return result;
    }
    case 'callback':
      return client.$transaction(async (tx) => build(tx));
    case 'manual': {
      await using txn = await client.$transaction();
      const result = await build(txn);
      await txn.commit();

      return result;
    }
  }
}

/** Two tags and two active users. `ua` is linked to t1, `ub` to nothing. Fixed ids keep runs comparable. */
export async function seed(client: CerialClient): Promise<void> {
  await client.db.Tag.create({ data: { id: 't1', name: 't1' } });
  await client.db.Tag.create({ data: { id: 't2', name: 't2' } });
  await client.db.User.create({
    data: { id: 'ua', email: 'a@x.io', name: 'a', isActive: true, age: 10, tagIds: ['t1'] },
  });
  await client.db.User.create({ data: { id: 'ub', email: 'b@x.io', name: 'b', isActive: true, age: 20 } });
}

/** The keys a row carries, sorted. */
export const keysOf = (row: object | null | undefined): string[] | null | undefined =>
  row ? Object.keys(row).sort() : (row as null | undefined);

/** Reads user `ua` back, so a cell can assert what was written and not only what came back. */
export async function storedUser(client: CerialClient, id: string) {
  const row = await client.db.User.findOne({ where: { id } });

  return row && { name: row.name, age: row.age, tags: row.tagIds.map(String).sort() };
}

/** What the database holds for the two seeded users and the one a create cell adds after a cell ran. */
export type Stored = Record<'ua' | 'ub' | 'uc', Awaited<ReturnType<typeof storedUser>>>;

/**
 * One cell of the matrix. `exec` runs the call through a mode and reduces the result to a plain
 * view, so a cell is written once with its typed result and compared as data in every mode.
 */
export interface Cell {
  label: string;
  exec: (client: CerialClient, mode: Mode) => Promise<unknown>;
  expected: unknown;
  stored: Stored;
}

export function cell<T>(
  label: string,
  run: (m: Models) => CerialQueryPromise<T>,
  view: (result: T) => unknown,
  expected: unknown,
  stored: Stored,
): Cell {
  const exec = async (client: CerialClient, mode: Mode): Promise<unknown> => view(await runIn(client, mode, run));

  return { label, exec, expected, stored };
}

/** Seeds, runs the cell through one mode, and asserts the returned view and the stored rows. */
export async function assertCell(client: CerialClient, mode: Mode, c: Cell): Promise<{ got: unknown; stored: Stored }> {
  await seed(client);
  const got = await c.exec(client, mode);

  return {
    got,
    stored: {
      ua: await storedUser(client, 'ua'),
      ub: await storedUser(client, 'ub'),
      uc: await storedUser(client, 'uc'),
    },
  };
}

export const UNTOUCHED: Stored = {
  ua: { name: 'a', age: 10, tags: ['tag:t1'] },
  ub: { name: 'b', age: 20, tags: [] },
  uc: null,
};
