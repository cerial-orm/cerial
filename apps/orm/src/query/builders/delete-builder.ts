/**
 * DELETE query builder
 *
 * Supports cascade delete based on @onDelete decorator:
 * - Required relations: Auto-cascade (delete children when parent deleted)
 * - Optional relations with @onDelete: Use specified action (Cascade, SetNull, Restrict, NoAction)
 * - Optional relations without @onDelete: Auto SetNull (clear the FK)
 * - Array relations: Remove ID from arrays (cleanup)
 */

import { getUniqueFields } from '../../parser/model-metadata';
import type { ModelMetadata, ModelRegistry, OnDeleteAction, WhereClause } from '../../types';
import type { CompiledQuery } from '../compile/types';
import { transformWhereClause } from '../filters/transformer';
import { transformOrValidateRecordId } from '../transformers';
import { expandCompositeKey, expandObjectUniqueKey, validateUniqueField } from './select-builder';

/** Build DELETE query */
export function buildDeleteQuery(model: ModelMetadata, where: WhereClause): CompiledQuery {
  // Build WHERE clause
  const whereClause = transformWhereClause(where, model);

  // Build query
  const parts = [`DELETE FROM ${model.tableName}`, whereClause.text].filter((p) => p);

  return {
    text: parts.join(' '),
    vars: whereClause.vars,
  };
}

/** Build DELETE query with RETURN */
export function buildDeleteQueryWithReturn(model: ModelMetadata, where: WhereClause): CompiledQuery {
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
  transactionMode?: boolean,
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
  const statements: string[] = transactionMode ? [] : ['BEGIN TRANSACTION'];
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
        // Set FK to null (for @nullable fields — stores queryable null value)
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

      case 'SetNone':
        // Set FK to NONE (for non-@nullable optional fields — field absent)
        if (dep.isArray) {
          statements.push(
            `UPDATE ${dep.model.tableName} SET ${recordFieldName} -= $to_delete.id WHERE ${recordFieldName} CONTAINSANY $to_delete.id`,
          );
        } else {
          statements.push(
            `UPDATE ${dep.model.tableName} SET ${recordFieldName} = NONE WHERE ${recordFieldName} IN $to_delete.id`,
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
  if (!transactionMode) statements.push('COMMIT TRANSACTION');

  return {
    text: `${statements.join(';\n')};`,
    vars,
  };
}

/**
 * Extract record ID from where clause for unique operations
 * Validates that at least one unique field is present and returns the ID if available.
 * Also expands composite unique keys and returns the expanded where clause.
 */
export function getRecordIdFromWhere(
  where: WhereClause,
  model: ModelMetadata,
  methodName = 'deleteUnique',
): { hasId: boolean; id?: string; idFieldName?: string; expandedWhere: WhereClause } {
  // Validate unique field requirement
  validateUniqueField(where, model, methodName);

  // Expand composite unique keys and object @unique keys
  let expandedWhere = expandCompositeKey(where, model);
  expandedWhere = expandObjectUniqueKey(expandedWhere, model);

  const idField = model.fields.find((f) => f.isId);
  if (idField && expandedWhere[idField.name] !== undefined && expandedWhere[idField.name] !== null) {
    return {
      hasId: true,
      id: expandedWhere[idField.name] as string,
      idFieldName: idField.name,
      expandedWhere,
    };
  }

  // Check for other unique fields that could identify the record
  const uniqueFields = getUniqueFields(model);
  const providedUniqueField = uniqueFields.find(
    (f) => expandedWhere[f.name] !== undefined && expandedWhere[f.name] !== null,
  );

  return {
    hasId: false,
    idFieldName: providedUniqueField?.name,
    expandedWhere,
  };
}

/**
 * Build DELETE query for a single record by ID
 * @param model - Model metadata
 * @param id - Record ID (plain string, not table:id format)
 * @param returnBefore - Whether to return the deleted record (RETURN BEFORE vs RETURN NONE)
 */
export function buildDeleteUniqueQuery(model: ModelMetadata, id: string, returnBefore: boolean): CompiledQuery {
  const recordId = transformOrValidateRecordId(model.tableName, id);
  const returnClause = returnBefore ? 'RETURN BEFORE' : 'RETURN NONE';

  return {
    text: `DELETE ${recordId.toString()} ${returnClause}`,
    vars: {},
  };
}

/**
 * Build a query to find a record by unique field (not ID)
 * Returns the record ID for subsequent DELETE operation
 */
function buildFindIdByUniqueFieldQuery(model: ModelMetadata, where: WhereClause): CompiledQuery {
  const whereClause = transformWhereClause(where, model);

  return {
    text: `SELECT id FROM ONLY ${model.tableName} ${whereClause.text} LIMIT 1`,
    vars: whereClause.vars,
  };
}

/**
 * Build DELETE query with cascade support for a single record
 * @param model - Model metadata
 * @param where - Where clause (must contain unique field)
 * @param registry - Model registry for cascade resolution
 * @param returnBefore - Whether to return the deleted record
 */
export function buildDeleteUniqueWithCascade(
  model: ModelMetadata,
  where: WhereClause,
  registry: ModelRegistry,
  returnBefore: boolean,
  transactionMode?: boolean,
): CompiledQuery {
  const { hasId, id, idFieldName: _idFieldName, expandedWhere } = getRecordIdFromWhere(where, model);

  // Find dependent relations
  const dependents = findDependentRelations(model.name, registry);
  const cascadeDeps = dependents.filter((d) => d.recordField && d.onDelete !== 'NoAction');
  const restrictDeps = cascadeDeps.filter((d) => d.onDelete === 'Restrict');

  // Simple case: no cascade dependencies needed
  if (cascadeDeps.length === 0) {
    if (hasId) return buildDeleteUniqueQuery(model, id!, returnBefore);

    // Non-ID lookup without cascade - use simple WHERE-based delete
    return returnBefore ? buildDeleteQueryWithReturn(model, expandedWhere) : buildDeleteQuery(model, expandedWhere);
  }

  // Build transaction
  const statements: string[] = transactionMode ? [] : ['BEGIN TRANSACTION'];
  const vars: Record<string, unknown> = {};

  // If ID is provided, use it directly; otherwise look up by unique field
  if (hasId) {
    const recordId = transformOrValidateRecordId(model.tableName, id!);
    vars.deleteId = recordId;
    statements.push('LET $deleteId = $deleteId');
  } else {
    // Look up record by unique field - need to handle case where record doesn't exist
    const lookupQuery = buildFindIdByUniqueFieldQuery(model, expandedWhere);
    Object.assign(vars, lookupQuery.vars);
    statements.push(`LET $record = (${lookupQuery.text})`);
    // If record doesn't exist, return empty array
    statements.push('IF $record IS NONE { RETURN [] }');
    statements.push('LET $deleteId = $record.id');
  }

  // Store ID for cascade operations
  statements.push('LET $to_delete = [$deleteId]');

  // Handle Restrict checks
  for (const dep of restrictDeps) {
    if (!dep.recordField) continue;

    const recordFieldName = dep.recordField.name;
    const checkVarName = `$has_${dep.model.tableName}_deps`;

    if (dep.isArray) {
      statements.push(
        `LET ${checkVarName} = (SELECT count() as cnt FROM ${dep.model.tableName} WHERE ${recordFieldName} CONTAINSANY $to_delete GROUP ALL)[0].cnt ?? 0`,
      );
    } else {
      statements.push(
        `LET ${checkVarName} = (SELECT count() as cnt FROM ${dep.model.tableName} WHERE ${recordFieldName} IN $to_delete GROUP ALL)[0].cnt ?? 0`,
      );
    }

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
        if (dep.isArray) {
          statements.push(`DELETE FROM ${dep.model.tableName} WHERE ${recordFieldName} CONTAINSANY $to_delete`);
        } else {
          statements.push(`DELETE FROM ${dep.model.tableName} WHERE ${recordFieldName} IN $to_delete`);
        }
        break;

      case 'SetNull':
        if (dep.isArray) {
          statements.push(
            `UPDATE ${dep.model.tableName} SET ${recordFieldName} -= $to_delete WHERE ${recordFieldName} CONTAINSANY $to_delete`,
          );
        } else {
          statements.push(
            `UPDATE ${dep.model.tableName} SET ${recordFieldName} = NULL WHERE ${recordFieldName} IN $to_delete`,
          );
        }
        break;

      case 'SetNone':
        if (dep.isArray) {
          statements.push(
            `UPDATE ${dep.model.tableName} SET ${recordFieldName} -= $to_delete WHERE ${recordFieldName} CONTAINSANY $to_delete`,
          );
        } else {
          statements.push(
            `UPDATE ${dep.model.tableName} SET ${recordFieldName} = NONE WHERE ${recordFieldName} IN $to_delete`,
          );
        }
        break;

      case 'NoAction':
        break;
    }
  }

  // Delete the record (using DELETE $recordId for variable reference)
  const returnClause = returnBefore ? 'RETURN BEFORE' : 'RETURN NONE';
  statements.push(`DELETE $deleteId ${returnClause}`);

  // Commit transaction
  if (!transactionMode) statements.push('COMMIT TRANSACTION');

  return {
    text: `${statements.join(';\n')};`,
    vars,
  };
}
