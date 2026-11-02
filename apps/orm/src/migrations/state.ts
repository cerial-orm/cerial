import { RecordId, type Surreal } from 'surrealdb';
import { CerialMigrationError } from '../errors';
import { MIGRATIONS_TABLE } from './state-tables';

/**
 * Row ids in `_cerial_migrations` are arrays, so a name is data and never part of statement text:
 * a model row is `[schemaName, modelName]` and the schema row is `[schemaName]`. The two lengths differ, so a
 * model row and a schema row can never share an id, whatever the names are.
 */
export type MigrationStatus = 'pending' | 'applied';

export interface ModelStateInput {
  readonly schemaName: string;
  readonly modelName: string;
  readonly fingerprint: string;
  readonly cerialVersion: string;
  readonly status: MigrationStatus;
}

export interface SchemaStateInput {
  readonly schemaName: string;
  readonly fingerprint: string;
  /** Audit trail only; nothing reads it back to decide anything. */
  readonly statements: readonly string[];
  readonly managedTables: readonly string[];
  /** What the row holds now (`readState(...).schema?.managedTables`), so a shrink can be judged. */
  readonly previousManagedTables: readonly string[];
  /** Tables an applied `REMOVE TABLE` took out in this same apply; only these may leave `managedTables`. */
  readonly removedTables?: readonly string[];
}

/** A statement and the values it binds, ready to sit inside a `BEGIN`/`COMMIT` script. */
export interface StatePiece {
  readonly query: string;
  readonly bindings: Record<string, unknown>;
}

export interface ModelState {
  readonly fingerprint: string;
  readonly cerialVersion: string;
  readonly appliedAt: Date | string | undefined;
}

export interface SchemaState {
  readonly fingerprint: string;
  readonly statements: readonly string[];
  readonly managedTables: readonly string[];
}

export interface MigrationState {
  /** Only models whose row is `applied` and well formed. */
  readonly models: ReadonlyMap<string, ModelState>;
  readonly schema: SchemaState | undefined;
}

const EMPTY_STATE: MigrationState = { models: new Map(), schema: undefined };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Upserts model rows in one statement: the text is fixed and every value, ids included, is bound, so several
 * models share one script. `appliedAt` is the database clock, never the client's.
 */
export function buildModelStateWrite(inputs: ModelStateInput | readonly ModelStateInput[]): StatePiece {
  const list = Array.isArray(inputs) ? inputs : [inputs as ModelStateInput];

  return {
    query:
      "FOR $row IN $modelRows { UPSERT $row.id SET kind = 'model', fingerprint = $row.fingerprint, appliedAt = time::now(), cerialVersion = $row.cerialVersion, status = $row.status }",
    bindings: {
      modelRows: list.map((input) => ({
        id: new RecordId(MIGRATIONS_TABLE, [input.schemaName, input.modelName]),
        fingerprint: input.fingerprint,
        cerialVersion: input.cerialVersion,
        status: input.status,
      })),
    },
  };
}

/**
 * Upserts the schema row. Refuses a write that drops a table from `managedTables` unless the caller names it in
 * `removedTables`, because forgetting a managed table means nothing ever cleans it up.
 */
export function buildSchemaStateWrite(input: SchemaStateInput): StatePiece {
  const kept = new Set([...input.managedTables, ...(input.removedTables ?? [])]);
  const dropped = input.previousManagedTables.filter((table) => !kept.has(table));
  if (dropped.length) {
    throw new CerialMigrationError(
      `Refusing to forget managed table(s) ${dropped.map((t) => JSON.stringify(t)).join(', ')} for schema ${JSON.stringify(input.schemaName)}: no applied REMOVE TABLE accounts for them`,
    );
  }

  return {
    query:
      "UPSERT $schemaStateId SET kind = 'schema', fingerprint = $schemaFingerprint, appliedAt = time::now(), statements = $schemaStatements, managedTables = $schemaTables",
    bindings: {
      schemaStateId: new RecordId(MIGRATIONS_TABLE, [input.schemaName]),
      schemaFingerprint: input.fingerprint,
      schemaStatements: [...input.statements],
      schemaTables: [...input.managedTables],
    },
  };
}

async function run(surreal: Surreal, piece: StatePiece): Promise<void> {
  const [response] = await surreal.query(piece.query, piece.bindings).responses();
  if (response && !response.success) {
    throw new CerialMigrationError(`Writing migration state failed: ${response.error.message}`, {
      cause: response.error,
    });
  }
}

export function writeModelState(surreal: Surreal, input: ModelStateInput): Promise<void> {
  return run(surreal, buildModelStateWrite(input));
}

/** Reads the current `managedTables` itself, so a standalone write is judged against what is stored. */
export async function writeSchemaState(
  surreal: Surreal,
  input: Omit<SchemaStateInput, 'previousManagedTables'>,
): Promise<void> {
  const { schema } = await readState(surreal, input.schemaName);

  return run(surreal, buildSchemaStateWrite({ ...input, previousManagedTables: schema?.managedTables ?? [] }));
}

function warnCorrupt(schemaName: string, id: unknown[]): void {
  console.warn(
    `[cerial] Ignoring a malformed migration state row ${JSON.stringify(id)} for schema ${JSON.stringify(schemaName)}; it is treated as not applied`,
  );
}

/**
 * Reads one schema entry's state. Reads only: a database without the state table gives an empty state and
 * nothing is created. A `pending` row, or a row of the wrong shape, reads as no state for its model, since
 * applying again is always safe and skipping wrongly is not. Rows of other schema names are not looked at.
 */
export async function readState(surreal: Surreal, schemaName: string): Promise<MigrationState> {
  const [info] = await surreal.query('INFO FOR DB').collect<[{ tables?: Record<string, unknown> }]>();
  if (!info.tables || !(MIGRATIONS_TABLE in info.tables)) return EMPTY_STATE;

  const [rows] = await surreal
    .query('SELECT * FROM type::table($table) WHERE id[0] = $schemaName', { table: MIGRATIONS_TABLE, schemaName })
    .collect<[Record<string, unknown>[]]>();

  const models = new Map<string, ModelState>();
  let schema: SchemaState | undefined;

  for (const row of rows) {
    const key = (row.id as RecordId | undefined)?.id;
    if (!Array.isArray(key)) continue;

    if (key.length === 2 && typeof key[1] === 'string') {
      if (row.status === 'pending') continue;
      if (
        row.status !== 'applied' ||
        row.kind !== 'model' ||
        typeof row.fingerprint !== 'string' ||
        !row.fingerprint ||
        typeof row.cerialVersion !== 'string'
      ) {
        warnCorrupt(schemaName, key);
        continue;
      }
      models.set(key[1], {
        fingerprint: row.fingerprint,
        cerialVersion: row.cerialVersion,
        appliedAt: row.appliedAt as Date | string | undefined,
      });
    } else if (key.length === 1) {
      if (
        row.kind !== 'schema' ||
        typeof row.fingerprint !== 'string' ||
        !isStringArray(row.statements) ||
        !isStringArray(row.managedTables)
      ) {
        warnCorrupt(schemaName, key);
        continue;
      }
      schema = { fingerprint: row.fingerprint, statements: row.statements, managedTables: row.managedTables };
    } else warnCorrupt(schemaName, key);
  }

  return { models, schema };
}
