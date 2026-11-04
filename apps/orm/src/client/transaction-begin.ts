/**
 * Beginning a transaction with options. SDK 2.2.1's `beginTransaction()` sends the `begin` RPC with no
 * params, so isolation and read-only cannot be passed through it. The Surreal instances Cerial opens are
 * built over wrapped engines (public `createRemoteEngines()` and `RpcEngine.send`) whose `begin` sends the
 * options held in a per-instance slot.
 */

import { createRemoteEngines, type Engines, RpcEngine, Surreal, type SurrealTransaction } from 'surrealdb';
import { CerialTransactionError, CerialValidationError } from '../errors';
import type { TransactionBeginOptions } from '../types';

/** The `begin` RPC params. */
interface BeginParams {
  isolation?: string;
  read_only?: boolean;
}

/**
 * The options the next `begin` on one instance sends. `queue` serialises Cerial's begins so one call's
 * options never reach another's: only the begin round trip is held, not the transaction.
 */
interface BeginSlot {
  pending: BeginParams | undefined;
  queue: Promise<unknown>;
}

const slots = new WeakMap<Surreal, BeginSlot>();

const ISOLATION_LEVELS = ['snapshot', 'serializable'];

function enginesWith(slot: BeginSlot): Engines {
  return Object.fromEntries(
    Object.entries(createRemoteEngines()).map(([scheme, factory]) => [
      scheme,
      (context: Parameters<typeof factory>[0]) => {
        const engine = factory(context);
        if (!(engine instanceof RpcEngine)) return engine;
        const plainBegin = engine.begin.bind(engine);
        engine.begin = async (session) => {
          const params = slot.pending;
          if (!params) return plainBegin(session);
          // With options the reply is `{ id, ... }`; the SDK expects the bare id
          const reply = await engine.send<'begin', unknown[], { id: Awaited<ReturnType<typeof plainBegin>> }>({
            method: 'begin',
            params: [params],
            session,
          });

          return reply.id;
        };

        return engine;
      },
    ]),
  );
}

/** A Surreal instance whose transactions can begin with isolation and read-only options. */
export function createSurreal(): Surreal {
  const slot: BeginSlot = { pending: undefined, queue: Promise.resolve() };
  const surreal = new Surreal({ engines: enginesWith(slot) });
  slots.set(surreal, slot);

  return surreal;
}

/**
 * Refuse a bad option before anything is sent. The server takes SQL level names such as
 * `'read committed'` and silently runs `snapshot`, so Cerial must check the value itself.
 * `strict` (manual mode) also refuses keys that are not begin options.
 */
export function validateBeginOptions(options: unknown, strict = false): void {
  if (options === undefined) return;
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new CerialValidationError('Invalid $transaction options: expected an object', { operation: '$transaction' });
  }

  const { isolation, readOnly } = options as Record<string, unknown>;
  if (isolation !== undefined && !(typeof isolation === 'string' && ISOLATION_LEVELS.includes(isolation))) {
    throw new CerialValidationError(
      `Invalid $transaction option "isolation": expected 'snapshot' or 'serializable', got ${JSON.stringify(isolation) ?? String(isolation)}`,
      { operation: '$transaction' },
    );
  }
  if (readOnly !== undefined && typeof readOnly !== 'boolean') {
    throw new CerialValidationError(
      `Invalid $transaction option "readOnly": expected a boolean, got ${JSON.stringify(readOnly) ?? String(readOnly)}`,
      { operation: '$transaction' },
    );
  }

  if (!strict) return;
  for (const key of Object.keys(options)) {
    if (key === 'isolation' || key === 'readOnly') continue;
    throw new CerialValidationError(
      `Unknown $transaction option "${key}": a manual transaction accepts "isolation" and "readOnly"`,
      { operation: '$transaction' },
    );
  }
}

function toParams(options: TransactionBeginOptions | undefined): BeginParams | undefined {
  const params: BeginParams = {};
  if (options?.isolation !== undefined) params.isolation = options.isolation;
  if (options?.readOnly) params.read_only = true;

  return Object.keys(params).length ? params : undefined;
}

/**
 * Begin a transaction, with the given options when there are any. Every retry calls this again with the
 * same options, so a retried transaction keeps its isolation and read-only.
 */
export async function beginTransaction(
  surreal: Surreal,
  options?: TransactionBeginOptions,
): Promise<SurrealTransaction> {
  validateBeginOptions(options);
  const params = toParams(options);
  const slot = slots.get(surreal);

  if (!slot) {
    if (params) {
      throw new CerialTransactionError(
        'Cannot begin a transaction with isolation or readOnly: the connection was not opened by Cerial',
        { operation: '$transaction' },
      );
    }

    return surreal.beginTransaction();
  }

  const turn = slot.queue.then(async () => {
    slot.pending = params;
    try {
      return await surreal.beginTransaction();
    } finally {
      slot.pending = undefined;
    }
  });
  slot.queue = turn.catch(() => undefined);

  return turn;
}
