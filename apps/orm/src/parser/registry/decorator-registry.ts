import { arrayDecorators } from './decorators/array';
import { defaultDecorators } from './decorators/defaults';
import { geometryDecorators } from './decorators/geometry';
import { identityDecorators } from './decorators/identity';
import { modifierDecorators } from './decorators/modifiers';
import { relationDecorators } from './decorators/relation';
import { temporalDecorators } from './decorators/temporal';
import { uuidDecorators } from './decorators/uuid';
import type { DecoratorEntry, DecoratorName } from './types';

/** Every group of decorator entries, in a fixed order. Adding a decorator is one entry in one group. */
const DECORATOR_GROUPS: readonly (readonly DecoratorEntry[])[] = [
  identityDecorators,
  relationDecorators,
  temporalDecorators,
  defaultDecorators,
  uuidDecorators,
  arrayDecorators,
  modifierDecorators,
  geometryDecorators,
];

function buildRegistry(groups: readonly (readonly DecoratorEntry[])[]): ReadonlyMap<DecoratorName, DecoratorEntry> {
  const entries = new Map<DecoratorName, DecoratorEntry>();
  for (const entry of groups.flat()) {
    if (entries.has(entry.name)) throw new Error(`Decorator '${entry.name}' is registered twice`);
    entries.set(entry.name, entry);
  }

  return entries;
}

/** Every registered decorator, keyed by its name as written in a schema (sigil included). */
export const DECORATOR_REGISTRY: ReadonlyMap<DecoratorName, DecoratorEntry> = buildRegistry(DECORATOR_GROUPS);

/** Look up a decorator by name, such as `@id` or `@@index`. */
export function getDecoratorEntry(name: string): DecoratorEntry | undefined {
  return DECORATOR_REGISTRY.get(name as DecoratorName);
}
