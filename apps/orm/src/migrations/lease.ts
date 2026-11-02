import { Duration, RecordId, type Surreal } from 'surrealdb';
import { CerialMigrationError } from '../errors';
import { MIGRATION_LEASE_TABLE } from './state-tables';
import type { StatePiece } from './state';

export interface LeaseOptions {
  /** How long a holder owns the lease without renewing it. Default 60 000. */
  readonly leaseMs?: number;
  /** How often `withLease` renews. Default a third of `leaseMs`. */
  readonly renewMs?: number;
  /** Longest an acquirer waits for a live holder. Default 90 000, above the lease so a dead holder cannot time a waiter out. */
  readonly waitMs?: number;
  /** Ceiling of the polling backoff while waiting. Default 500. */
  readonly pollMs?: number;
}

export interface MigrationLease {
  /** Unique per acquirer; every lease write is conditional on it. */
  readonly holder: string;
  /** Extends the lease. Throws `CerialMigrationError` when this holder no longer owns an unexpired lease. */
  renew(): Promise<void>;
  /** Deletes the record only while this holder still owns it, so a late release never touches a successor's lease. */
  release(): Promise<void>;
  /** The statement `applyPlan` runs last before `COMMIT`: it throws, failing the transaction, when the lease is lost. */
  holderCheck(): StatePiece;
}

const DEFAULTS = { leaseMs: 60_000, waitMs: 90_000, pollMs: 500 } as const;
const FIRST_POLL_MS = 25;
const LEASE_ID = 'migrate';

const leaseRecord = (): RecordId => new RecordId(MIGRATION_LEASE_TABLE, LEASE_ID);
const leaseDuration = (ms: number): Duration => new Duration([Math.max(1, Math.round(ms)), 'ms'].join(''));
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const isConflict = (message: string): boolean => /conflict|retry/i.test(message);
const describe = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

interface Outcome {
  readonly ok: boolean;
  readonly result?: unknown;
  readonly error?: string;
}

/** One statement; a failed statement comes back as data so the caller can tell a lost race from a real error. */
async function run(surreal: Surreal, query: string, bindings: Record<string, unknown>): Promise<Outcome> {
  let responses;
  try {
    responses = await surreal.query(query, bindings).responses();
  } catch (cause) {
    throw new CerialMigrationError(`The migration lease statement failed: ${describe(cause)}`, {
      cause,
      statement: { text: query, vars: {} },
    });
  }
  const [response] = responses;
  if (response?.success) return { ok: true, result: response.result };

  return { ok: false, error: response?.error.message ?? 'no response' };
}

async function readHolder(surreal: Surreal): Promise<{ holder: string; expiresAt: unknown } | undefined> {
  const outcome = await run(surreal, 'SELECT holder, expiresAt FROM ONLY $rec', { rec: leaseRecord() });
  if (!outcome.ok) return undefined;

  return (outcome.result as { holder: string; expiresAt: unknown } | undefined) ?? undefined;
}

function failed(query: string, message: string): CerialMigrationError {
  return new CerialMigrationError(`The migration lease statement failed: ${message}`, {
    statement: { text: query, vars: {} },
  });
}

const CREATE_QUERY = 'CREATE ONLY $rec SET holder = $me, expiresAt = time::now() + $lease RETURN NONE';
const RECLAIM_QUERY =
  'UPDATE $rec SET holder = $me, expiresAt = time::now() + $lease WHERE expiresAt < time::now() RETURN BEFORE';

/** One attempt: create, else reclaim an expired record. `undefined` means a live holder or a lost race. */
async function attempt(surreal: Surreal, me: string, leaseMs: number): Promise<boolean> {
  const bindings = { rec: leaseRecord(), me, lease: leaseDuration(leaseMs) };

  const created = await run(surreal, CREATE_QUERY, bindings);
  if (created.ok) return true;
  const createError = created.error ?? '';
  if (isConflict(createError)) return false;
  if (!/already exists/i.test(createError)) throw failed(CREATE_QUERY, createError);

  const reclaimed = await run(surreal, RECLAIM_QUERY, bindings);
  if (!reclaimed.ok) {
    if (isConflict(reclaimed.error ?? '')) return false;
    throw failed(RECLAIM_QUERY, reclaimed.error ?? '');
  }
  const before = reclaimed.result as { holder?: string }[] | undefined;
  if (!before?.length) return false;

  // The UPDATE is conditional, but a read-back is the proof that this holder, and no concurrent one, owns the row.
  const now = await readHolder(surreal);
  if (now?.holder !== me) return false;
  console.warn(`[cerial] Reclaimed the migration lease from expired holder ${before[0]?.holder ?? 'unknown'}.`);

  return true;
}

/**
 * Takes the one migration lease of the connected database, waiting for a live holder. The database's clock decides
 * expiry everywhere. Throws `CerialMigrationError` naming the holder when the wait runs out.
 */
export async function acquireLease(surreal: Surreal, options: LeaseOptions = {}): Promise<MigrationLease> {
  const leaseMs = options.leaseMs ?? DEFAULTS.leaseMs;
  const waitMs = options.waitMs ?? DEFAULTS.waitMs;
  const pollMs = options.pollMs ?? DEFAULTS.pollMs;
  const me = crypto.randomUUID();
  const started = Date.now();
  let delay = Math.min(FIRST_POLL_MS, pollMs);

  while (!(await attempt(surreal, me, leaseMs))) {
    const waited = Date.now() - started;
    if (waited >= waitMs) {
      const current = await readHolder(surreal);

      throw new CerialMigrationError(
        `Waited ${waited} ms for the migration lease, still held by ${current?.holder ?? 'another migrator'}; ` +
          `it is released when that migration ends, or reclaimed once it expires.`,
      );
    }
    await sleep(Math.min(delay, waitMs - waited) * (0.5 + Math.random()));
    delay = Math.min(delay * 2, pollMs);
  }

  const RENEW =
    'UPDATE $rec SET expiresAt = time::now() + $lease WHERE holder = $me AND expiresAt > time::now() RETURN AFTER';

  return {
    holder: me,
    async renew() {
      const outcome = await run(surreal, RENEW, { rec: leaseRecord(), me, lease: leaseDuration(leaseMs) });
      if (!outcome.ok) throw failed(RENEW, outcome.error ?? '');
      if (!(outcome.result as unknown[] | undefined)?.length) {
        throw new CerialMigrationError(
          `The migration lease of holder ${me} expired or was reclaimed; it cannot be renewed.`,
        );
      }
    },
    async release() {
      const query = 'DELETE $rec WHERE holder = $me RETURN NONE';
      const outcome = await run(surreal, query, { rec: leaseRecord(), me });
      if (!outcome.ok) throw failed(query, outcome.error ?? '');
    },
    holderCheck: () => buildHolderCheck(me),
  };
}

/** The last statement before `COMMIT`: THROW rolls the whole transaction back when `me` lost the lease. */
export function buildHolderCheck(me: string): StatePiece {
  return {
    query:
      "IF array::len(SELECT VALUE id FROM $leaseRecord WHERE holder = $leaseHolder AND expiresAt > time::now()) = 0 { THROW 'The migration lease was lost before commit' }",
    bindings: { leaseRecord: leaseRecord(), leaseHolder: me },
  };
}

/**
 * Runs `work` under the lease: renews on a timer (default a third of the lease) and releases in `finally`.
 * A renewal that fails is surfaced to `work` through the handle's next `renew()` and, as always, by the holder check.
 */
export async function withLease<T>(
  surreal: Surreal,
  work: (lease: MigrationLease) => Promise<T>,
  options: LeaseOptions = {},
): Promise<T> {
  const lease = await acquireLease(surreal, options);
  const leaseMs = options.leaseMs ?? DEFAULTS.leaseMs;
  const timer = setInterval(
    () => {
      lease.renew().catch((cause) => console.warn(`[cerial] Renewing the migration lease failed: ${describe(cause)}`));
    },
    options.renewMs ?? Math.floor(leaseMs / 3),
  );

  try {
    return await work(lease);
  } finally {
    clearInterval(timer);
    await lease
      .release()
      .catch((cause) => console.warn(`[cerial] Releasing the migration lease failed: ${describe(cause)}`));
  }
}
