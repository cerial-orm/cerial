/**
 * Raw SurrealDB access for the facts suite. Nothing here imports from `src/`:
 * a failure after a SurrealDB upgrade must mean a premise moved, not that the
 * ORM changed.
 */

const URL = 'http://127.0.0.1:8000/sql';
const NAMESPACE = 'main';

export interface StatementResult {
  readonly status: string;
  readonly result: unknown;
}

export interface ScratchDatabase {
  readonly name: string;
  /** Whether the database is still listed in the namespace. */
  exists(): Promise<boolean>;
  /** Removes the database; safe to call twice. */
  remove(): Promise<void>;
}

async function post(database: string, surql: string): Promise<StatementResult[]> {
  const response = await fetch(URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'surreal-ns': NAMESPACE,
      'surreal-db': database,
      Authorization: `Basic ${Buffer.from('root:root').toString('base64')}`,
    },
    body: surql,
  });
  if (!response.ok) throw new Error(`SurrealDB answered ${response.status}: ${await response.text()}`);
  const body = (await response.json()) as StatementResult[];

  return body.map(({ status, result }) => ({ status, result }));
}

/** Runs SurrealQL in the scratch database; each statement reports its own status. */
export function run(db: ScratchDatabase, surql: string): Promise<StatementResult[]> {
  return post(db.name, surql);
}

/** Opens a uniquely named database in the shared instance. */
export async function withScratchDatabase(name: string): Promise<ScratchDatabase> {
  const unique = `facts_${name}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const [defined] = await post('main', `DEFINE DATABASE ${unique};`);
  if (defined?.status !== 'OK') throw new Error(`could not define ${unique}: ${JSON.stringify(defined)}`);

  return {
    name: unique,
    async exists() {
      const [info] = await post('main', 'INFO FOR NS;');
      const databases = (info!.result as { databases: Record<string, string> }).databases;

      return unique in databases;
    },
    async remove() {
      await post('main', `REMOVE DATABASE IF EXISTS ${unique};`);
    },
  };
}
