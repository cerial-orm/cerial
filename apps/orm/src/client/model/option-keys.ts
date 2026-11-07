import { CerialValidationError } from '../../errors';
import { isObject } from '../../utils/type-utils';

/**
 * The option keys each model method takes, mirroring the generated signatures. `txn` is stripped by the
 * caller before the check. The write methods list `compute` only so `refuseCompute` keeps its own message,
 * and findOne / findUnique list the paging and order keys their read-option check already refuses by name.
 */
const READ_KEYS = ['where', 'select', 'include', 'compute', 'orderBy'] as const;
export const METHOD_KEYS = {
  findOne: [...READ_KEYS, 'limit', 'offset'],
  findUnique: [...READ_KEYS, 'limit', 'offset'],
  findMany: [...READ_KEYS, 'limit', 'offset'],
  create: ['data', 'select', 'include', 'compute'],
  updateMany: ['where', 'data', 'unset', 'select', 'include', 'compute'],
  updateUnique: ['where', 'data', 'unset', 'select', 'include', 'compute', 'return'],
  upsert: ['where', 'create', 'update', 'unset', 'select', 'include', 'compute', 'return'],
  deleteMany: ['where', 'compute'],
  deleteUnique: ['where', 'compute', 'return'],
} as const satisfies Record<string, readonly string[]>;

export type OptionedMethod = keyof typeof METHOD_KEYS;

/** Throw on a key the method does not take, so a typo such as `wehre` cannot widen a read or a delete. */
export function assertKnownOptionKeys(method: OptionedMethod, options: unknown, modelName: string): void {
  if (!isObject(options)) return;
  const accepted: readonly string[] = METHOD_KEYS[method];
  const unknown = Object.keys(options).find((key) => !accepted.includes(key));
  if (unknown === undefined) return;

  throw new CerialValidationError(
    `${method} does not take the option '${unknown}'; it takes ${accepted.join(', ')}, txn`,
    { model: modelName, operation: method, field: unknown },
  );
}
