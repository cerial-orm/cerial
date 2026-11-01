/**
 * Cascade traversal: which models a delete reaches, through which relations, and which of them sit on a
 * cascade cycle. Build-time only, it reads the registry and never rows.
 */

import type { ModelMetadata, ModelRegistry, OnDeleteAction } from '../../types';

/**
 * Find all models that have relations pointing to the given model
 * Returns info about how to handle deletion for each relation
 */
export function findDependentRelations(
  targetModelName: string,
  registry: ModelRegistry,
): Array<{
  model: ModelMetadata;
  relationField: ModelMetadata['fields'][0];
  recordField: ModelMetadata['fields'][0] | undefined;
  isRequired: boolean;
  isArray: boolean;
  onDelete: OnDeleteAction;
}> {
  const dependents: Array<{
    model: ModelMetadata;
    relationField: ModelMetadata['fields'][0];
    recordField: ModelMetadata['fields'][0] | undefined;
    isRequired: boolean;
    isArray: boolean;
    onDelete: OnDeleteAction;
  }> = [];

  for (const model of Object.values(registry)) {
    for (const field of model.fields) {
      if (field.type !== 'relation' || !field.relationInfo) continue;
      if (field.relationInfo.targetModel !== targetModelName) continue;

      // This relation points to our target model
      const recordFieldName = field.relationInfo.fieldRef;
      const recordField = recordFieldName ? model.fields.find((f) => f.name === recordFieldName) : undefined;

      const isArray = field.isArray || recordField?.isArray || false;
      // For array relations, the parent record doesn't "require" the deleted item to exist
      // So we never cascade for array relations - just clean up the array
      const isRequired = !isArray && field.isRequired && !field.relationInfo.isReverse;

      // Determine onDelete action
      let onDelete: OnDeleteAction;
      if (field.relationInfo.onDelete) {
        // Explicit @onDelete decorator (only allowed on optional relations per validator)
        onDelete = field.relationInfo.onDelete;
      } else if (isRequired) {
        // Required relations auto-cascade
        onDelete = 'Cascade';
      } else if (recordField?.isNullable) {
        // @nullable optional relations: SetNull (store null for queryability)
        onDelete = 'SetNull';
      } else {
        // Non-nullable optional relations and array relations: SetNone (clear the field)
        onDelete = 'SetNone';
      }

      dependents.push({
        model,
        relationField: field,
        recordField,
        isRequired,
        isArray,
        onDelete,
      });
    }
  }

  return dependents;
}

export type DependentRelation = ReturnType<typeof findDependentRelations>[number];

export interface CascadeEdge extends DependentRelation {
  /** Name of the model whose deletion reaches this edge */
  readonly parent: string;
  /** 1 for a direct dependent of the root */
  readonly depth: number;
  /** Model names from the root down to `parent` */
  readonly path: readonly string[];
  /** Cascade edge whose dependent is already on the path, so the walk stops here */
  readonly cyclic: boolean;
}

export interface CascadeGraph {
  readonly root: string;
  readonly edges: readonly CascadeEdge[];
  /** Models that sit on a cycle made of cascading edges */
  readonly cyclicModels: ReadonlySet<string>;
}

/**
 * Walk every relation a delete of `model` reaches. `Cascade` descends; `SetNull`, `SetNone` and `Restrict`
 * are reported and stop, since the row survives or the delete is refused. `NoAction` and FK-less
 * relations are left out.
 */
export function walkCascade(model: ModelMetadata, registry: ModelRegistry): CascadeGraph {
  const edges: CascadeEdge[] = [];
  const cyclicModels = new Set<string>();

  const visit = (name: string, path: string[]): void => {
    for (const dep of findDependentRelations(name, registry)) {
      if (!dep.recordField || dep.onDelete === 'NoAction') continue;

      const cascades = dep.onDelete === 'Cascade';
      const cycleStart = cascades ? path.indexOf(dep.model.name) : -1;
      const cyclic = cycleStart !== -1;
      edges.push({ ...dep, parent: name, depth: path.length, path: [...path], cyclic });

      if (cyclic) for (const onCycle of path.slice(cycleStart)) cyclicModels.add(onCycle);
      else if (cascades) visit(dep.model.name, [...path, dep.model.name]);
    }
  };

  visit(model.name, [model.name]);

  return { root: model.name, edges, cyclicModels };
}
