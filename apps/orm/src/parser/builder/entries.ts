import { DECORATOR_REGISTRY } from '../registry';
import type { DecoratorEntry, DecoratorName, DecoratorTarget } from '../registry';
import { bucketOf } from './argument-source';
import { NO_PUBLIC_METHOD, RELATION_ONLY_METHOD } from './exposure';
import type { BuilderKind } from './exposure';

/** The name without its sigil, which is both the chain method name and the options key. */
export function bareName(name: DecoratorName): string {
  return name.replace(/^@@?/, '');
}

function byName(names: readonly DecoratorName[], name: DecoratorName): boolean {
  return names.includes(name);
}

/** The entries that get a chain method on a `target` builder, in registry order. */
export function chainEntries(
  target: DecoratorTarget,
  kind: BuilderKind = 'plain',
  registry: ReadonlyMap<DecoratorName, DecoratorEntry> = DECORATOR_REGISTRY,
): DecoratorEntry[] {
  return [...registry.values()].filter(
    (entry) =>
      bucketOf(entry.args) === 'chain' &&
      entry.targets.includes(target) &&
      !byName(NO_PUBLIC_METHOD, entry.name) &&
      (kind === 'relation' || !byName(RELATION_ONLY_METHOD, entry.name)),
  );
}

/** The entries that take an options key on a `target`, in registry order. */
export function optionEntries(
  target: DecoratorTarget,
  registry: ReadonlyMap<DecoratorName, DecoratorEntry> = DECORATOR_REGISTRY,
): DecoratorEntry[] {
  return [...registry.values()].filter((entry) => bucketOf(entry.args) === 'options' && entry.targets.includes(target));
}
