import { collectEnumNames, collectLiteralNames, collectObjectNames, collectTupleNames } from '../../parser/parser';
import type { NameSets, SchemaSource } from './types';

export const NO_NAMES: NameSets = { objects: new Set(), tuples: new Set(), literals: new Set(), enums: new Set() };

/** The names the `.cerial` sources declare, read as text so a file can name a type another file declares */
export function collectDslNames(sources: readonly SchemaSource[]): NameSets {
  const objects = new Set<string>();
  const tuples = new Set<string>();
  const literals = new Set<string>();
  const enums = new Set<string>();
  for (const { content } of sources) {
    for (const name of collectObjectNames(content)) objects.add(name);
    for (const name of collectTupleNames(content)) tuples.add(name);
    for (const name of collectLiteralNames(content)) literals.add(name);
    for (const name of collectEnumNames(content)) enums.add(name);
  }

  return { objects, tuples, literals, enums };
}

export function unionNames(a: NameSets, b: NameSets): NameSets {
  return {
    objects: new Set([...a.objects, ...b.objects]),
    tuples: new Set([...a.tuples, ...b.tuples]),
    literals: new Set([...a.literals, ...b.literals]),
    enums: new Set([...a.enums, ...b.enums]),
  };
}
