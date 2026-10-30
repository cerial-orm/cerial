import type { SourceRange } from '../../types';
import { DECORATOR_REGISTRY } from '../registry';
import type { DecoratorEntry, DecoratorName, DecoratorTarget, RegisteredDecorator } from '../registry';
import { optionsToken } from './argument-source';
import { BUILDER_RANGE } from './chain';
import { bareName, optionEntries } from './entries';
import type { BuilderNode, Options } from './types';

export interface BuildOptionsConfig<E extends DecoratorEntry> {
  readonly registry?: ReadonlyMap<DecoratorName, E>;
  readonly range?: SourceRange;
}

/**
 * Turn an options object into decorator nodes through each entry's own handler. A key the target has no
 * options entry for throws, since a silently ignored key is a decorator that never applied.
 */
export function buildOptions<T extends DecoratorTarget, E extends DecoratorEntry = RegisteredDecorator>(
  target: T,
  options: Options<T, E>,
  config: BuildOptionsConfig<E> = {},
): BuilderNode[] {
  const entries = new Map(
    optionEntries(target, config.registry ?? DECORATOR_REGISTRY).map((e) => [bareName(e.name), e]),
  );
  const nodes: BuilderNode[] = [];
  for (const [key, value] of Object.entries(options)) {
    const entry = entries.get(key);
    if (!entry)
      throw new Error(
        `'${key}' is not an options key on a ${target}; expected one of ${[...entries.keys()].join(', ')}`,
      );
    if (value === undefined) continue;
    // A directive kind may repeat, so a list builds one node per entry, in order.
    for (const item of Array.isArray(value) ? value : [value])
      nodes.push(entry.parse(optionsToken(entry, item), config.range ?? BUILDER_RANGE));
  }

  return nodes;
}
