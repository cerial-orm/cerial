import { createPosition, createRange } from '../types/ast';
import type { SourceRange } from '../../types';
import { DECORATOR_REGISTRY } from '../registry';
import type { DecoratorEntry, DecoratorName, DecoratorTarget, RegisteredDecorator } from '../registry';
import { chainToken } from './argument-source';
import { bareName, chainEntries } from './entries';
import type { BuilderKind } from './exposure';
import type { BuilderNode, Chain } from './types';

/** Builder nodes have no source text, so they carry the same empty range the parser gives a tuple element. */
export const BUILDER_RANGE: SourceRange = createRange(createPosition(0, 0, 0), createPosition(0, 0, 0));

export interface ChainOptions<K extends BuilderKind, E extends DecoratorEntry> {
  readonly kind?: K;
  /** Where entries come from; the registry unless a test supplies its own. */
  readonly registry?: ReadonlyMap<DecoratorName, E>;
  readonly range?: SourceRange;
}

/** The node for one chain call, produced by the entry's own handler so it matches the parser's. */
function chainNode(entry: DecoratorEntry, arg: unknown, range: SourceRange): BuilderNode {
  return entry.parse(chainToken(entry, arg), range);
}

function chainOf(entries: readonly DecoratorEntry[], range: SourceRange, nodes: readonly BuilderNode[]): object {
  const methods: Record<string, unknown> = { decorators: () => [...nodes] };
  for (const entry of entries) {
    methods[bareName(entry.name)] = (...args: unknown[]) =>
      chainOf(entries, range, [...nodes, chainNode(entry, args[0], range)]);
  }

  return Object.freeze(methods);
}

/**
 * Start a decorator chain for a field on `target`. Each call returns a new chain, so a partial chain can be
 * reused. The methods are the registry's chain entries for the target: nothing here names a decorator.
 */
export function createChain<
  T extends DecoratorTarget,
  K extends BuilderKind = 'plain',
  E extends DecoratorEntry = RegisteredDecorator,
>(target: T, options: ChainOptions<K, E> = {}): Chain<T, K, E> {
  const entries = chainEntries(target, options.kind ?? 'plain', options.registry ?? DECORATOR_REGISTRY);

  return chainOf(entries, options.range ?? BUILDER_RANGE, []) as Chain<T, K, E>;
}
