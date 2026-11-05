/**
 * Shared helpers for the transaction option e2e files: run the same work in each `$transaction` mode
 * under the same options, so every mode is held to one contract.
 */

import type { CerialQueryPromise, TransactionBeginOptions } from 'cerial';
import { type CerialClient, uniqueEmail } from '../../test-helper';

export type Mode = 'array' | 'callback' | 'manual';
export const MODES: Mode[] = ['array', 'callback', 'manual'];

/** The model surface an operation uses; the client's `db` and a transaction client both fit it. */
export type Db = Pick<CerialClient['db'], 'BasicsUser' | 'BasicsPost' | 'BasicsProfile'>;
export type Op = (db: Db) => CerialQueryPromise<unknown>;

/** Every combination of the two begin options, including each omitted, and the empty object. */
export const BEGIN_OPTIONS: [string, TransactionBeginOptions | undefined][] = [
  ['no options', undefined],
  ['{}', {}],
  ["isolation 'snapshot'", { isolation: 'snapshot' }],
  ["isolation 'serializable'", { isolation: 'serializable' }],
  ['readOnly true', { readOnly: true }],
  ['readOnly false', { readOnly: false }],
  ['snapshot + readOnly true', { isolation: 'snapshot', readOnly: true }],
  ['snapshot + readOnly false', { isolation: 'snapshot', readOnly: false }],
  ['serializable + readOnly true', { isolation: 'serializable', readOnly: true }],
  ['serializable + readOnly false', { isolation: 'serializable', readOnly: false }],
];

export const newUser = (label = 'opt') => ({ email: uniqueEmail(label), name: label, isActive: true });

/**
 * Run `ops` in one transaction of the given mode and return each op's result. Array mode submits the
 * queries together; callback and manual mode await them one by one on the transaction client. Manual
 * mode commits when every op succeeded and cancels when one threw, as a caller would.
 */
export function runIn(
  client: CerialClient,
  mode: Mode,
  options: TransactionBeginOptions | undefined,
  ops: Op[],
): Promise<unknown[]> {
  return runInUnchecked(client, mode, options, ops);
}

/** `runIn` for negative tests: the options are not checked by the types, only by the client at runtime. */
export async function runInUnchecked(
  client: CerialClient,
  mode: Mode,
  untyped: unknown,
  ops: Op[],
): Promise<unknown[]> {
  const options = untyped as TransactionBeginOptions | undefined;

  if (mode === 'array')
    return client.$transaction(
      ops.map((op) => op(client.db)),
      options,
    );

  if (mode === 'callback') {
    return client.$transaction(async (tx) => {
      const results: unknown[] = [];
      for (const op of ops) results.push(await op(tx));

      return results;
    }, options);
  }

  const tx = await client.$transaction(options);
  try {
    const results: unknown[] = [];
    for (const op of ops) results.push(await op(tx));
    await tx.commit();

    return results;
  } catch (error) {
    await tx.cancel();
    throw error;
  }
}

/** The rejection of a promise-like, or undefined when it resolved. */
export async function caught(run: () => PromiseLike<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }

  return undefined;
}
