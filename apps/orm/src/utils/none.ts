/**
 * NONE sentinel value for explicitly marking a field as absent (NONE) in SurrealDB.
 *
 * In SurrealDB, NONE means the field is absent from the record — distinct from null.
 * Use this in create/update operations to explicitly remove a field:
 *
 * @example
 * ```typescript
 * import { NONE } from 'cerial';
 *
 * // Remove the bio field (set to NONE/absent)
 * await client.db.User.updateMany({
 *   where: { id: '...' },
 *   data: { bio: NONE }
 * });
 * ```
 */

/** Unique symbol identifying the NONE sentinel */
const NONE_SYMBOL: unique symbol = Symbol.for('cerial.NONE');

/** The NONE sentinel value — use this to explicitly remove a field (set to NONE/absent in SurrealDB) */
export const NONE: typeof NONE_SYMBOL = NONE_SYMBOL;

/** Type of the NONE sentinel value */
export type CerialNone = typeof NONE_SYMBOL;

/** Check if a value is the NONE sentinel */
export function isNone(value: unknown): value is CerialNone {
  return value === NONE;
}
