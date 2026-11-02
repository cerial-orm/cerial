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
import type { ModelMetadata, ModelRegistry, WhereClause } from '../../types';
import type { CompiledQuery } from '../compile/types';
import { createCompileContext } from '../compile/var-allocator';
import { CerialValidationError } from '../../errors';
import { transformDestructiveWhere } from '../filters/transformer';
import { transformOrValidateRecordId } from '../transformers';
import { type CascadeEdge, type DependentRelation, findDependentRelations, walkCascade } from './cascade-graph';
import { expandCompositeKey, expandObjectUniqueKey, validateUniqueField } from './select-builder';

/** Build DELETE query */
export function buildDeleteQuery(
  model: ModelMetadata,
  where: WhereClause,
  registry?: ModelRegistry,
  operation = 'deleteMany',
): CompiledQuery {
  // Build WHERE clause
  const whereClause = transformDestructiveWhere(where, model, operation, registry);

  // Build query
  const parts = [`DELETE FROM ${model.tableName}`, whereClause.text].filter((p) => p);

  return {
    text: parts.join(' '),
    vars: whereClause.vars,
  };
}

/** Build DELETE query with RETURN */
export function buildDeleteQueryWithReturn(
  model: ModelMetadata,
  where: WhereClause,
  registry?: ModelRegistry,
  operation = 'deleteMany',
): CompiledQuery {
  // Build WHERE clause
  const whereClause = transformDestructiveWhere(where, model, operation, registry);

  // Build query with RETURN BEFORE to get deleted records
  const parts = [`DELETE FROM ${model.tableName}`, whereClause.text, 'RETURN BEFORE'].filter((p) => p);

  return {
    text: parts.join(' '),
    vars: whereClause.vars,
  };
}

/** Deepest level of a cascade a delete follows; a cascade that reaches further is refused */
const CASCADE_DEPTH_LIMIT = 16;

interface BeyondLimit {
  readonly dep: DependentRelation;
  /** Model names from the root down to the model that owns `dep` */
  readonly path: readonly string[];
}

interface LevelEdge extends CascadeEdge {
  /** Reached by following a cycle level by level, so its rows exclude those an earlier level already holds */
  readonly unrolled: boolean;
  /**
   * Edges of one unrolled level are adjacent and share a single id capture, held by the first of them.
   * That first edge carries the level's size, whether a level follows and what sits past the limit; the
   * others carry 0. A walked edge is a level of its own.
   */
  readonly levelSize: number;
  readonly levelDescends: boolean;
  /** Relations one level past the limit: any row they find refuses the delete */
  readonly beyondLimit: readonly BeyondLimit[];
}

function reachableDependents(modelName: string, registry: ModelRegistry): DependentRelation[] {
  return findDependentRelations(modelName, registry).filter((dep) => dep.recordField && dep.onDelete !== 'NoAction');
}

function depthMessage(root: string, model: string, path: readonly string[]): string {
  return `Cannot delete ${root}: cascade deeper than ${CASCADE_DEPTH_LIMIT} levels at ${model} (${path.join(' > ')})`;
}

const relationKey = (dep: DependentRelation): string => `${dep.model.name}.${dep.recordField!.name}`;

/**
 * The walk stops at the first repeat of a model on a cycle, which would strand the rows below it. The cyclic
 * edges at one position are unrolled together instead, one level per step up to the limit, each level holding
 * the edges of every model the level before reached. The script then grows with depth times edges, where one
 * level per edge would grow as edges to the power of depth. A graph that is deeper than the limit without a
 * cycle is refused here, before any statement exists.
 */
function unrollCycles(edges: readonly CascadeEdge[], registry: ModelRegistry): LevelEdge[] {
  const out: LevelEdge[] = [];
  const unrolledAt = new Set<string>();

  const unroll = (first: CascadeEdge[]): void => {
    let level = first;

    while (level.length) {
      const depth = level[0]!.depth;
      const atLimit = depth >= CASCADE_DEPTH_LIMIT;
      const next = new Map<string, CascadeEdge>();
      const beyond = new Map<string, BeyondLimit>();

      for (const edge of level) {
        if (edge.onDelete !== 'Cascade') continue;

        const path = [...edge.path, edge.model.name];
        for (const dep of reachableDependents(edge.model.name, registry)) {
          const key = relationKey(dep);
          if (atLimit) {
            if (!beyond.has(key)) beyond.set(key, { dep, path });
          } else if (!next.has(key)) {
            next.set(key, { ...dep, parent: edge.model.name, depth: depth + 1, path, cyclic: false });
          }
        }
      }

      level.forEach((edge, k) =>
        out.push({
          ...edge,
          cyclic: false,
          unrolled: true,
          levelSize: k === 0 ? level.length : 0,
          levelDescends: k === 0 && (next.size > 0 || beyond.size > 0),
          beyondLimit: k === 0 ? [...beyond.values()] : [],
        }),
      );
      level = [...next.values()];
    }
  };

  for (const edge of edges) {
    if (edge.cyclic) {
      const position = `${edge.depth}|${edge.path.join('>')}`;
      if (unrolledAt.has(position)) continue;

      unrolledAt.add(position);
      unroll(edges.filter((e) => e.cyclic && e.depth === edge.depth && e.path.join('>') === edge.path.join('>')));
      continue;
    }
    if (edge.depth > CASCADE_DEPTH_LIMIT) {
      throw new CerialValidationError(depthMessage(edge.path[0]!, edge.model.name, [...edge.path, edge.model.name]));
    }
    out.push({ ...edge, unrolled: false, levelSize: 1, levelDescends: false, beyondLimit: [] });
  }

  return out;
}

/**
 * Push the statements for every edge a delete reaches: ids of each cascading level are captured first,
 * then all `Restrict` checks run, then `SetNull`/`SetNone` cleanup, then deletes from the deepest level up.
 * `rootTarget` is the expression holding the ids being deleted: `$to_delete.id` where the variable is a
 * list of rows, `$to_delete` where it is already a list of ids.
 *
 * Returns the guard to wrap around the root target of the final delete. Inside an SDK transaction a THROW
 * does not stop the script, so when any `Restrict` edge or depth check exists every write targets an empty
 * set while `$blocked` is set.
 */
function emitDependentStatements(
  statements: string[],
  walked: readonly CascadeEdge[],
  rootTarget: string,
  registry: ModelRegistry,
): (target: string) => string {
  const edges = unrollCycles(walked, registry);
  const rootName = walked[0]!.path[0]!;
  const parentTarget: string[] = [];
  const captured: Array<string | undefined> = [];
  const capturedTables: Array<ReadonlySet<string>> = [];
  const lastCaptured: string[] = [];

  const rootTable = registry[rootName]!.tableName;

  // Ids a row of `table` must not be captured again from: the root rows and every earlier capture that can
  // hold the table. Without it a cycle in the data would look as deep as the limit
  const seen = (table: string, upTo: number): string => {
    const holders: string[] = [];
    for (let j = 0; j < upTo; j++) if (captured[j] && capturedTables[j]!.has(table)) holders.push(captured[j]!);
    if (table === rootTable) holders.unshift(rootTarget);

    return holders.map((h) => ` AND id NOT IN ${h}`).join('');
  };

  edges.forEach((edge, i) => {
    parentTarget[i] = edge.depth === 1 ? rootTarget : lastCaptured[edge.depth - 1]!;
    if (!edge.levelSize) return;

    const level = edges.slice(i, i + edge.levelSize).filter((e) => e.onDelete === 'Cascade');
    const descends = edge.unrolled ? edge.levelDescends : (edges[i + 1]?.depth ?? 0) > edge.depth;
    if (!level.length || !descends) return;

    // One capture for the whole level: a SELECT per table, its relations OR-ed together
    const byTable = new Map<string, string[]>();
    for (const e of level) {
      const conditions = byTable.get(e.model.tableName) ?? [];
      conditions.push(`${e.recordField!.name} ${e.isArray ? 'CONTAINSANY' : 'IN'} ${parentTarget[i]}`);
      byTable.set(e.model.tableName, conditions);
    }
    const selects = [...byTable].map(([table, conditions]) => {
      const where = conditions.length > 1 ? `(${conditions.join(' OR ')})` : conditions[0];
      const exclude = edge.unrolled ? seen(table, i) : '';

      return `(SELECT VALUE id FROM ${table} WHERE ${where}${exclude})`;
    });

    captured[i] = `$cd_${i + 1}`;
    capturedTables[i] = new Set(byTable.keys());
    lastCaptured[edge.depth] = captured[i]!;
    statements.push(
      `LET ${captured[i]} = ${selects.length > 1 ? `array::flatten([${selects.join(', ')}])` : selects[0]}`,
    );
  });

  // Restrict: count referencing rows and use IF to conditionally fail
  const checkVars: string[] = [];
  edges.forEach((edge, i) => {
    if (edge.onDelete !== 'Restrict') return;

    const table = edge.model.tableName;
    const base = `$has_${table}_deps`;
    const checkVarName = checkVars.includes(base) ? `${base}_${i + 1}` : base;
    const match = edge.isArray ? 'CONTAINSANY' : 'IN';
    checkVars.push(checkVarName);

    statements.push(
      `LET ${checkVarName} = (SELECT count() as cnt FROM ${table} WHERE ${edge.recordField!.name} ${match} ${parentTarget[i]} GROUP ALL)[0].cnt ?? 0`,
    );
    statements.push(
      `IF ${checkVarName} > 0 { THROW "Cannot delete ${edge.parent}: ${edge.model.name} records with @onDelete(Restrict) reference this record" }`,
    );
  });

  edges.forEach((edge, i) => {
    edge.beyondLimit.forEach(({ dep, path }) => {
      const checkVarName = `$deep_${checkVars.length + 1}`;
      const match = dep.isArray ? 'CONTAINSANY' : 'IN';
      checkVars.push(checkVarName);

      statements.push(
        `LET ${checkVarName} = (SELECT count() as cnt FROM ${dep.model.tableName} WHERE ${dep.recordField!.name} ${match} ${captured[i]}${seen(dep.model.tableName, i + 1)} GROUP ALL)[0].cnt ?? 0`,
      );
      statements.push(
        `IF ${checkVarName} > 0 { THROW "${depthMessage(walked[0]!.path[0]!, dep.model.name, [...path, dep.model.name])}" }`,
      );
    });
  });

  const guarded = checkVars.length > 0;
  if (guarded) statements.push(`LET $blocked = ${checkVars.map((v) => `${v} > 0`).join(' OR ')}`);
  const guard = (target: string): string => (guarded ? `(IF $blocked { [] } ELSE { ${target} })` : target);

  edges.forEach((edge, i) => {
    if (edge.onDelete !== 'SetNull' && edge.onDelete !== 'SetNone') return;

    const fieldName = edge.recordField!.name;
    const match = edge.isArray ? 'CONTAINSANY' : 'IN';
    // SetNull stores a queryable null (@nullable fields); SetNone leaves the field absent. Array
    // foreign keys have no null state, so both just remove the id.
    const assignment = edge.isArray
      ? `${fieldName} -= ${parentTarget[i]}`
      : `${fieldName} = ${edge.onDelete === 'SetNull' ? 'NULL' : 'NONE'}`;
    statements.push(
      `UPDATE ${edge.model.tableName} SET ${assignment} WHERE ${fieldName} ${match} ${guard(parentTarget[i]!)}`,
    );
  });

  for (let i = edges.length - 1; i >= 0; i--) {
    const edge = edges[i]!;
    if (edge.onDelete !== 'Cascade') continue;

    const match = edge.isArray ? 'CONTAINSANY' : 'IN';
    statements.push(
      `DELETE FROM ${edge.model.tableName} WHERE ${edge.recordField!.name} ${match} ${guard(parentTarget[i]!)}`,
    );
  }

  return guard;
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
  const whereClause = transformDestructiveWhere(where, model, 'deleteMany', registry);

  // Every edge the delete reaches, NoAction and FK-less relations left out
  // Required relations cascade, optional relations SetNull (or their explicit @onDelete action)
  const { edges } = walkCascade(model, registry);

  // If no explicit cascade operations needed, use simple delete
  if (!edges.length) {
    return buildDeleteQueryWithReturn(model, where, registry);
  }

  // Build statements with transaction for atomicity
  // Transaction ensures IF/THROW prevents subsequent operations
  const statements: string[] = transactionMode ? [] : ['BEGIN TRANSACTION'];
  const vars: Record<string, unknown> = { ...whereClause.vars };

  // Get records to be deleted first
  statements.push(`LET $to_delete = (SELECT id FROM ${model.tableName} ${whereClause.text})`);

  const guard = emitDependentStatements(statements, edges, '$to_delete.id', registry);

  // Delete by the ids captured above, not by re-running the filter: the cascade statements have already
  // removed the children a relation filter such as posts: { some } looks at, so it would match nothing
  statements.push(`DELETE FROM ${model.tableName} WHERE id IN ${guard('$to_delete.id')} RETURN BEFORE`);

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
): { hasId: boolean; idAlone: boolean; id?: string; idFieldName?: string; expandedWhere: WhereClause } {
  // Validate unique field requirement
  validateUniqueField(where, model, methodName);

  // Expand composite unique keys and object @unique keys
  let expandedWhere = expandCompositeKey(where, model);
  expandedWhere = expandObjectUniqueKey(expandedWhere, model);

  const idField = model.fields.find((f) => f.isId);
  if (idField && expandedWhere[idField.name] !== undefined && expandedWhere[idField.name] !== null) {
    // The id shortcut deletes by record id and ignores every other key, so it is only safe when the id is
    // the sole key: any other condition (a field, a $raw fragment) must still filter through the lookup path
    const idAlone = Object.keys(expandedWhere).every((k) => k === idField.name || expandedWhere[k] === undefined);

    return {
      hasId: true,
      idAlone,
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
    idAlone: false,
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

  // Bound, never interpolated: the id part is caller text and the driver's escaper leaves a backslash alone
  const idBinding = createCompileContext('rid_').bind('record', 'id', recordId, 'string');

  return {
    text: `DELETE ${idBinding.placeholder} ${returnClause}`,
    vars: idBinding.vars,
  };
}

/**
 * Build a query to find a record by unique field (not ID)
 * Returns the record ID for subsequent DELETE operation
 */
function buildFindIdByUniqueFieldQuery(
  model: ModelMetadata,
  where: WhereClause,
  registry: ModelRegistry,
): CompiledQuery {
  // Without a condition this would pick an arbitrary row, which the DELETE below then removes
  const whereClause = transformDestructiveWhere(where, model, 'deleteUnique', registry);

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
  const { idAlone, id, expandedWhere } = getRecordIdFromWhere(where, model);

  const { edges } = walkCascade(model, registry);

  // Simple case: no cascade dependencies needed
  if (!edges.length) {
    if (idAlone) return buildDeleteUniqueQuery(model, id!, returnBefore);

    // Non-ID lookup without cascade - use simple WHERE-based delete
    return returnBefore
      ? buildDeleteQueryWithReturn(model, expandedWhere, registry, 'deleteUnique')
      : buildDeleteQuery(model, expandedWhere, registry, 'deleteUnique');
  }

  // Build transaction
  const statements: string[] = transactionMode ? [] : ['BEGIN TRANSACTION'];
  const vars: Record<string, unknown> = {};

  // If ID is provided, use it directly; otherwise look up by unique field
  if (idAlone) {
    const recordId = transformOrValidateRecordId(model.tableName, id!);
    vars.deleteId = recordId;
    statements.push('LET $deleteId = $deleteId');
  } else {
    // Look up record by unique field - need to handle case where record doesn't exist
    const lookupQuery = buildFindIdByUniqueFieldQuery(model, expandedWhere, registry);
    Object.assign(vars, lookupQuery.vars);
    statements.push(`LET $record = (${lookupQuery.text})`);
    // If record doesn't exist, return empty array
    statements.push('IF $record IS NONE { RETURN [] }');
    statements.push('LET $deleteId = $record.id');
  }

  // Store ID for cascade operations
  // A lookup that found nothing leaves $deleteId NONE. The early RETURN above does not stop a script run inside
  // an SDK transaction, so the cascade and the final DELETE must also be harmless on NONE: an empty target
  // matches no row, where `IN [NONE]` would match every row whose foreign key is unset
  statements.push(
    idAlone ? 'LET $to_delete = [$deleteId]' : 'LET $to_delete = IF $deleteId IS NONE { [] } ELSE { [$deleteId] }',
  );

  const guard = emitDependentStatements(statements, edges, '$to_delete', registry);

  // Delete the record (using DELETE $recordId for variable reference)
  const returnClause = returnBefore ? 'RETURN BEFORE' : 'RETURN NONE';
  statements.push(
    idAlone
      ? `DELETE ${guard('$deleteId')} ${returnClause}`
      : `DELETE (IF $deleteId IS NONE { [] } ELSE { ${guard('$deleteId')} }) ${returnClause}`,
  );

  // Commit transaction
  if (!transactionMode) statements.push('COMMIT TRANSACTION');

  return {
    text: `${statements.join(';\n')};`,
    vars,
  };
}
