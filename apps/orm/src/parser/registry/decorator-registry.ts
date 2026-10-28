import { arrayDecorators } from './decorators/array';
import { defaultDecorators } from './decorators/defaults';
import { geometryDecorators } from './decorators/geometry';
import { identityDecorators } from './decorators/identity';
import { modelLevelDecorators } from './decorators/model-level';
import { modifierDecorators } from './decorators/modifiers';
import { relationDecorators } from './decorators/relation';
import { temporalDecorators } from './decorators/temporal';
import { uuidDecorators } from './decorators/uuid';
import type { DecoratorEntry, DecoratorName, DecoratorTarget } from './types';

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
  modelLevelDecorators,
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

/**
 * Resolve a field decorator token such as `@sort(asc)` to its entry, or undefined when the token is
 * not one the parser accepts. The token must have the shape the entry's `args` allow: a zero-argument
 * decorator is only the bare name, a value decorator needs its parentheses. With `target`, an entry that
 * is not legal there does not match.
 */
export function matchDecoratorToken(token: string, target?: DecoratorTarget): DecoratorEntry | undefined {
  const name = token.match(/^@\w+/)?.[0];
  const entry = name ? getDecoratorEntry(name) : undefined;
  if (!entry || (target && !entry.targets.includes(target))) return undefined;

  const bare = token === entry.name;
  const withParens = token.startsWith(`${entry.name}(`);
  switch (entry.args.kind) {
    case 'none':
      return bare ? entry : undefined;
    case 'choice':
      return bare ? (entry.args.optional ? entry : undefined) : withParens ? entry : undefined;
    default:
      return withParens ? entry : undefined;
  }
}
