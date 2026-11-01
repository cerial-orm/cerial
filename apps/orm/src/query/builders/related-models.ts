/**
 * Collects every model an operation touches, so lazy migration can define
 * related tables before a nested write or include reaches them.
 */

import type { ModelMetadata, ModelRegistry } from '../../types';
import { walkCascade } from './cascade-graph';
import { extractNestedOperations, isNestedCreate } from './nested-builder';
import type { IncludeClause } from './relation-builder';

function collectFromData(
  model: ModelMetadata,
  data: Record<string, unknown>,
  registry: ModelRegistry,
  names: Set<string>,
): void {
  for (const [fieldName, op] of extractNestedOperations(data, model).nestedOps) {
    const targetName = model.fields.find((f) => f.name === fieldName)?.relationInfo?.targetModel;
    const target = targetName ? registry[targetName] : undefined;
    if (!target) continue;

    names.add(target.name);
    if (!isNestedCreate(op)) continue;

    const created = Array.isArray(op.create) ? op.create : [op.create];
    for (const item of created) collectFromData(target, item as Record<string, unknown>, registry, names);
  }
}

function collectFromInclude(
  model: ModelMetadata,
  include: IncludeClause,
  registry: ModelRegistry,
  names: Set<string>,
): void {
  for (const [relationName, value] of Object.entries(include)) {
    if (!value) continue;

    const targetName = model.fields.find((f) => f.name === relationName && f.type === 'relation')?.relationInfo
      ?.targetModel;
    const target = targetName ? registry[targetName] : undefined;
    if (!target) continue;

    names.add(target.name);
    if (typeof value === 'object' && value.include) collectFromInclude(target, value.include, registry, names);
  }
}

/** Every model a transitive delete names: cascades descend, other actions stop at their dependent, NoAction is absent */
function collectFromDependents(model: ModelMetadata, registry: ModelRegistry, names: Set<string>): void {
  for (const edge of walkCascade(model, registry).edges) names.add(edge.model.name);
}

/** Names of the queried model plus every relation target reachable via nested writes, includes and cascading deletes */
export function collectRelatedModelNames(
  model: ModelMetadata,
  registry: ModelRegistry | undefined,
  operation: {
    data?: Array<Record<string, unknown> | undefined>;
    include?: IncludeClause;
    isDelete?: boolean;
  },
): string[] {
  const names = new Set([model.name]);
  if (!registry) return [...names];

  for (const data of operation.data ?? []) if (data) collectFromData(model, data, registry, names);
  if (operation.include) collectFromInclude(model, operation.include, registry, names);

  if (operation.isDelete) collectFromDependents(model, registry, names);

  return [...names];
}
