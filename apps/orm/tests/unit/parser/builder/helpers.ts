import type { DecoratorEntry, DecoratorName } from '../../../../src/parser/registry';
import { createDecorator } from '../../../../src/parser/types/ast';

/** A registry holding only `entries`, so a test can add an entry without touching `DECORATOR_REGISTRY`. */
export function registryOf<E extends DecoratorEntry>(...entries: readonly E[]): ReadonlyMap<DecoratorName, E> {
  return new Map(entries.map((entry) => [entry.name, entry]));
}

/** A one-value entry no real decorator resembles in behaviour: its node always carries `'synthetic'`. */
export const SYNTHETIC_CHAIN_ENTRY = {
  name: '@distinct',
  constructId: 'decorator.distinct',
  args: { kind: 'none' },
  targets: ['modelField'],
  excludes: [],
  description: 'Test entry.',
  parse: (_token, range) => createDecorator('distinct', range, 'synthetic'),
} as const satisfies DecoratorEntry;

/** A multi-part entry on a field target, which no registry entry is today. */
export const SYNTHETIC_OPTIONS_ENTRY = {
  name: '@@unique',
  constructId: 'directive.unique',
  args: { kind: 'nameAndFields' },
  targets: ['modelField'],
  excludes: [],
  description: 'Test entry.',
  parse: (token, range) => createDecorator('unique', range, token),
} as const satisfies DecoratorEntry;
