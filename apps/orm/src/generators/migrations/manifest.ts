/**
 * Desired-schema manifest generator.
 *
 * The client has no parser and no `.cerial` files, so the model `buildDesiredSchema` produces reaches it as a
 * frozen literal. Every string goes through `escapeTsString`, so a hostile name or default stays inert text.
 */

import { buildDesiredSchema } from '../../migrations/desired';
import type { LiteralRegistry, ModelMetadata, ModelRegistry, ObjectRegistry, TupleRegistry } from '../../types';
import { escapeTsString } from '../shared';

/** U+2028 and U+2029 are legal inside string literals since ES2019, but escaping them keeps the file portable. */
const quote = (value: string): string =>
  `'${escapeTsString(value)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')}'`;

function serialize(value: unknown): string {
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `[${value.map(serialize).join(', ')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);

    return `{ ${entries.map(([k, v]) => `${quote(k)}: ${serialize(v)}`).join(', ')} }`;
  }

  throw new Error(`The manifest cannot hold a ${typeof value} value`);
}

/** Generate the source of `internal/manifest.ts` from the same desired model the fingerprints use. */
export function generateManifestCode(
  models: ModelMetadata[],
  objectRegistry?: ObjectRegistry,
  tupleRegistry?: TupleRegistry,
  literalRegistry?: LiteralRegistry,
): string {
  const registry: ModelRegistry = {};
  for (const model of models) registry[model.name] = model;
  const desired = buildDesiredSchema(registry, objectRegistry, tupleRegistry, literalRegistry);

  return `/**
 * Generated desired-schema manifest
 * Do not edit manually
 */

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }

  return value;
}

/** The schema the models describe, for comparing against the live database without a schema file */
export const manifest = deepFreeze(${serialize(desired)} as const);
`;
}
