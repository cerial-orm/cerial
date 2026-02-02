/**
 * DELETE query builder
 *
 * Supports cascade delete based on @onDelete decorator:
 * - Required relations: Auto-cascade (delete children when parent deleted)
 * - Optional relations with @onDelete: Use specified action (Cascade, SetNull, Restrict, NoAction)
 * - Optional relations without @onDelete: Auto SetNull (clear the FK)
 * - Array relations: Remove ID from arrays (cleanup)
 */

import type { CompiledQuery } from '../compile/types';
import type { ModelMetadata, ModelRegistry, OnDeleteAction, WhereClause } from '../../types';
import { transformWhereClause } from '../filters/transformer';

/** Build DELETE query */
export function buildDeleteQuery(
  model: ModelMetadata,
  where: WhereClause,
): CompiledQuery {
  // Build WHERE clause
  const whereClause = transformWhereClause(where, model);

  // Build query
  const parts = [
    `DELETE FROM ${model.tableName}`,
    whereClause.text,
  ].filter((p) => p);

  return {
    text: parts.join(' '),
    vars: whereClause.vars,
  };
}

/** Build DELETE query with RETURN */
export function buildDeleteQueryWithReturn(
  model: ModelMetadata,
  where: WhereClause,
): CompiledQuery {
  // Build WHERE clause
  const whereClause = transformWhereClause(where, model);

  // Build query with RETURN BEFORE to get deleted records
  const parts = [`DELETE FROM ${model.tableName}`, whereClause.text, 'RETURN BEFORE'].filter((p) => p);

  return {
    text: parts.join(' '),
    vars: whereClause.vars,
  };
}

/**
 * Find all models that have relations pointing to the given model
 * Returns info about how to handle deletion for each relation
 */
function findDependentRelations(
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
      } else {
        // Optional relations and array relations: SetNull (or remove from array)
        onDelete = 'SetNull';
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

/**
 * Build DELETE query with cascade support
 * Handles @onDelete behavior for all dependent relations
 *
 * - Required relations: Auto-cascade (delete children when parent deleted)
 * - Optional with @onDelete: Use specified action (Cascade, SetNull, Restrict, NoAction)
 * - Optional without @onDelete: Auto SetNull (clear the FK)
 */
export function buildDeleteWithCascade(
  model: ModelMetadata,
  where: WhereClause,
  registry: ModelRegistry,
): CompiledQuery {
  // Build where clause
  const whereClause = transformWhereClause(where, model);

  // Find all dependent relations and filter out NoAction
  // Required relations cascade, optional relations SetNull (or their explicit @onDelete action)
  const dependents = findDependentRelations(model.name, registry);
  const cascadeDeps = dependents.filter((d) => d.recordField && d.onDelete !== 'NoAction');

  // Check for Restrict - needs special handling at query level
  const restrictDeps = cascadeDeps.filter((d) => d.onDelete === 'Restrict');

  // If no explicit cascade operations needed, use simple delete
  if (cascadeDeps.length === 0) {
    return buildDeleteQueryWithReturn(model, where);
  }

  // Build statements with transaction for atomicity
  // Transaction ensures IF/THROW prevents subsequent operations
  const statements: string[] = ['BEGIN TRANSACTION'];
  const vars: Record<string, unknown> = { ...whereClause.vars };

  // Get records to be deleted first
  statements.push(`LET $to_delete = (SELECT id FROM ${model.tableName} ${whereClause.text})`);

  // For Restrict: check if there are dependent records and use IF to conditionally fail
  for (const dep of restrictDeps) {
    if (!dep.recordField) continue;

    const recordFieldName = dep.recordField.name;
    const checkVarName = `$has_${dep.model.tableName}_deps`;

    if (dep.isArray) {
      statements.push(
        `LET ${checkVarName} = (SELECT count() as cnt FROM ${dep.model.tableName} WHERE ${recordFieldName} CONTAINSANY $to_delete.id GROUP ALL)[0].cnt ?? 0`,
      );
    } else {
      statements.push(
        `LET ${checkVarName} = (SELECT count() as cnt FROM ${dep.model.tableName} WHERE ${recordFieldName} IN $to_delete.id GROUP ALL)[0].cnt ?? 0`,
      );
    }

    // Use IF to throw error if dependencies exist
    statements.push(
      `IF ${checkVarName} > 0 { THROW "Cannot delete ${model.name}: ${dep.model.name} records with @onDelete(Restrict) reference this record" }`,
    );
  }

  // Process cascade and cleanup for non-Restrict deps
  for (const dep of cascadeDeps) {
    if (!dep.recordField || dep.onDelete === 'Restrict') continue;

    const recordFieldName = dep.recordField.name;

    switch (dep.onDelete) {
      case 'Cascade':
        // Delete dependent records
        if (dep.isArray) {
          statements.push(`DELETE FROM ${dep.model.tableName} WHERE ${recordFieldName} CONTAINSANY $to_delete.id`);
        } else {
          statements.push(`DELETE FROM ${dep.model.tableName} WHERE ${recordFieldName} IN $to_delete.id`);
        }
        break;

      case 'SetNull':
        // Set FK to null (not NONE) so it can be queried with { field: null }
        if (dep.isArray) {
          statements.push(
            `UPDATE ${dep.model.tableName} SET ${recordFieldName} -= $to_delete.id WHERE ${recordFieldName} CONTAINSANY $to_delete.id`,
          );
        } else {
          statements.push(
            `UPDATE ${dep.model.tableName} SET ${recordFieldName} = NULL WHERE ${recordFieldName} IN $to_delete.id`,
          );
        }
        break;

      case 'NoAction':
        // Do nothing - leave dangling references
        break;
    }
  }

  // Delete the main records and return them
  statements.push(`DELETE FROM ${model.tableName} ${whereClause.text} RETURN BEFORE`);

  // Commit transaction
  statements.push('COMMIT TRANSACTION');

  return {
    text: statements.join(';\n') + ';',
    vars,
  };
}
