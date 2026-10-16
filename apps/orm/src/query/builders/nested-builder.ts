/**
 * Nested operation builder - handles create/connect/disconnect for relations
 *
 * Nested Operations:
 * - create: Create a new related record and link it
 * - connect: Link to an existing record by ID
 * - disconnect: Remove the link (only for optional relations)
 *
 * For n-n (bidirectional): Updates both sides atomically in a transaction
 */

import type { RecordId } from 'surrealdb';
import { CerialValidationError } from '../../errors';
import type { ModelMetadata, ModelRegistry, SelectClause } from '../../types';
import type { RecordIdInput } from '../../utils/cerial-id';
import type { CompiledQuery } from '../compile/types';
import { createCompileContext, type FilterCompileContext } from '../compile/var-allocator';
import { transformDestructiveWhere } from '../filters/transformer';
import { applyFieldDefaults, transformData, transformOrValidateRecordId } from '../transformers';
import { validateKnownKeys } from '../validators/data-validator';
import type { IncludeClause } from './relation-builder';
import { buildSelectFields } from './select-builder';
import { buildUpdateSetClauses } from './update-builder';

/**
 * Run a nested create's data through the same steps as a plain create: field defaults, then wrapper
 * and RecordId transformation against the target model. Without this the nested row is written from
 * raw input, so a Date string, a CerialUuid or a Decimal reaches SurrealDB untransformed.
 */
function prepareNestedCreateData(data: Record<string, unknown>, targetModel: ModelMetadata): Record<string, unknown> {
  // A reverse create writes each key as a column name, so an undeclared key is refused before it can reach query text
  const unknownKeys = validateKnownKeys(data, targetModel);
  if (unknownKeys.length)
    throw new CerialValidationError(`Invalid data: ${unknownKeys.map((e) => e.message).join('; ')}`, {
      model: targetModel.name,
      field: unknownKeys[0]!.field,
    });

  return transformData(applyFieldDefaults(data, targetModel), targetModel);
}

/** Nested create input for a relation */
export interface NestedCreate<T = Record<string, unknown>> {
  create: T;
}

/** Nested connect input for a relation */
export interface NestedConnect {
  connect: RecordIdInput | RecordIdInput[];
}

/** Nested disconnect input for a relation */
export interface NestedDisconnect {
  disconnect: boolean | RecordIdInput | RecordIdInput[];
}

/** Nested set input for array relations - replaces all items */
export interface NestedSet {
  set: RecordIdInput[];
}

/** Combined nested operation type */
export type NestedOperation<T = Record<string, unknown>> =
  | NestedCreate<T>
  | NestedConnect
  | NestedDisconnect
  | NestedSet;

/** Check if value is a nested create operation */
export function isNestedCreate(value: unknown): value is NestedCreate {
  return typeof value === 'object' && value !== null && 'create' in value;
}

/** Check if value is a nested connect operation */
export function isNestedConnect(value: unknown): value is NestedConnect {
  return typeof value === 'object' && value !== null && 'connect' in value;
}

/** Check if value is a nested disconnect operation */
export function isNestedDisconnect(value: unknown): value is NestedDisconnect {
  return typeof value === 'object' && value !== null && 'disconnect' in value;
}

/** Check if value is a nested set operation */
export function isNestedSet(value: unknown): value is NestedSet {
  return typeof value === 'object' && value !== null && 'set' in value;
}

/** Check if value is any nested operation */
export function isNestedOperation(value: unknown): value is NestedOperation {
  return isNestedCreate(value) || isNestedConnect(value) || isNestedDisconnect(value) || isNestedSet(value);
}

/**
 * Validate nested operation constraints
 */
function validateNestedOperation(
  fieldName: string,
  value: unknown,
  field: ModelMetadata['fields'][0],
  model: ModelMetadata,
): void {
  const op = value as Record<string, unknown>;

  // Check for conflicting operations
  const hasCreate = 'create' in op;
  const hasConnect = 'connect' in op;
  const hasDisconnect = 'disconnect' in op;

  // For array relations, allow create+connect (add both new and existing items)
  // For single relations, disallow create+connect (can only have one target)
  if (hasCreate && hasConnect && !field.isArray) {
    throw new CerialValidationError(
      `Field "${fieldName}" on model "${model.name}": Cannot specify both "create" and "connect" for single relations (use one or the other)`,
      { model: model.name, field: fieldName },
    );
  }

  // create+disconnect doesn't make sense in any context
  if (hasCreate && hasDisconnect) {
    throw new CerialValidationError(
      `Field "${fieldName}" on model "${model.name}": Cannot specify both "create" and "disconnect" in the same nested operation`,
      { model: model.name, field: fieldName },
    );
  }

  // For single relations, connect+disconnect doesn't make sense (just use connect)
  if (hasConnect && hasDisconnect && !field.isArray) {
    throw new CerialValidationError(
      `Field "${fieldName}" on model "${model.name}": Cannot specify both "connect" and "disconnect" for single relations (use connect alone)`,
      { model: model.name, field: fieldName },
    );
  }

  // Check for disconnect on required non-array relation
  // For array relations (Relation[]), disconnect removes items from the array, which is always allowed
  if (hasDisconnect && field.isRequired && !field.isArray) {
    throw new CerialValidationError(
      `Field "${fieldName}" on model "${model.name}": Cannot disconnect a required relation. ` +
        `Use "connect" to switch to a different record instead.`,
      { model: model.name, field: fieldName },
    );
  }
}

/**
 * Extract nested operations from data object
 * Returns the data without nested operations, and the operations separately
 */
export function extractNestedOperations(
  data: Record<string, unknown>,
  model: ModelMetadata,
): {
  cleanData: Record<string, unknown>;
  nestedOps: Map<string, NestedOperation>;
} {
  const cleanData: Record<string, unknown> = {};
  const nestedOps = new Map<string, NestedOperation>();

  for (const [key, value] of Object.entries(data)) {
    // Check if this field is a relation field
    const field = model.fields.find((f) => f.name === key && f.type === 'relation');

    if (field && isNestedOperation(value)) {
      // Validate the nested operation
      validateNestedOperation(key, value, field, model);
      nestedOps.set(key, value);
    } else {
      cleanData[key] = value;
    }
  }

  return { cleanData, nestedOps };
}

/**
 * Check if this is a true n-n relation (both sides have Record[] and Relation[])
 * Returns the reverse field info if it's a bidirectional n-n, otherwise null
 */
function findBidirectionalNtoNField(
  sourceModel: ModelMetadata,
  sourceField: ModelMetadata['fields'][0],
  targetModel: ModelMetadata,
): { targetRecordField: string; targetRelationField: string } | null {
  if (!sourceField.relationInfo) return null;

  // Source must have a fieldRef (Record[] field)
  const sourceRecordField = sourceField.relationInfo.fieldRef;
  if (!sourceRecordField) return null;

  // Find the source Record field and check it's an array
  const sourceRecord = sourceModel.fields.find((f) => f.name === sourceRecordField);
  if (!sourceRecord?.isArray) return null;

  // Now look for a corresponding relation in target model that points back
  for (const targetField of targetModel.fields) {
    if (targetField.type !== 'relation' || !targetField.relationInfo) continue;
    if (targetField.relationInfo.targetModel !== sourceModel.name) continue;

    // For self-referential relations, skip if it's the same field
    // (e.g., SocialUser.following should not sync with itself)
    if (sourceModel.name === targetModel.name && targetField.name === sourceField.name) continue;

    // For self-referential relations, also skip if they use the same Record field
    // (e.g., both relations use the same followingIds field)
    if (sourceModel.name === targetModel.name && targetField.relationInfo.fieldRef === sourceRecordField) continue;

    // Found a relation pointing back - check if it has a Record[] field
    const targetRecordFieldName = targetField.relationInfo.fieldRef;
    if (!targetRecordFieldName) continue;

    const targetRecordField = targetModel.fields.find((f) => f.name === targetRecordFieldName);
    if (!targetRecordField?.isArray) continue;

    // This is a true n-n bidirectional relation
    return {
      targetRecordField: targetRecordFieldName,
      targetRelationField: targetField.name,
    };
  }

  return null;
}

/**
 * Find the Record field in target model that references the source model
 * Used for reverse relations to find which field needs to be set
 */
function findReverseRecordField(sourceModel: ModelMetadata, targetModel: ModelMetadata): string | undefined {
  // Find a Relation in target that points to source and has a fieldRef
  for (const field of targetModel.fields) {
    if (field.type !== 'relation' || field.relationInfo?.isReverse) continue;
    if (field.relationInfo?.targetModel === sourceModel.name && field.relationInfo?.fieldRef) {
      return field.relationInfo.fieldRef;
    }
  }

  return undefined;
}

/** Options shared by the nested create and update builders */
export interface NestedWriteOptions {
  /** Inside an outer transaction: emit no BEGIN/COMMIT */
  transactionMode?: boolean;
  /**
   * Create only: the record the row must be created as, in place of a server-generated id. Upsert's
   * create half passes the id from its `where`, the same record the plain upsert's CREATE targets
   */
  recordId?: RecordId;
  /** Update only: return the row as it was before the write, projected through `select` and `include` */
  returnBefore?: boolean;
  select?: SelectClause;
  include?: IncludeClause;
}

/**
 * The statement that returns the written row(s). With `select` or `include` the stored result is
 * projected through the same field list the plain write RETURNs, so the relation subqueries are the
 * plain path's own and an unknown include is rejected the same way.
 */
function buildNestedReturn(
  rows: string,
  single: boolean,
  model: ModelMetadata,
  registry: ModelRegistry,
  { select, include }: NestedWriteOptions,
  ctx: FilterCompileContext,
): string {
  if (!select && !include) return `RETURN ${rows};`;

  const fields = buildSelectFields(select, model, include, registry, ctx);

  return `RETURN (SELECT ${fields} FROM ${single ? 'ONLY ' : ''}${rows});`;
}

interface TargetCheck {
  targetModel: ModelMetadata;
  targetIds: RecordIdInput[];
  fieldName: string;
}

/**
 * Statements that abort the transaction when a linked record is missing. The runtime check in
 * assertNestedTargetsExist gives the caller a typed error first; this is the backstop for the paths that
 * run a compiled query without it ($transaction array mode) and for a record deleted in between.
 */
function buildTargetCheckStatements(checks: TargetCheck[], vars: Record<string, unknown>): string[] {
  const statements: string[] = [];
  checks.forEach((check, idx) => {
    check.targetIds.forEach((targetId, idIdx) => {
      const varName = `validate_${idx}_${idIdx}`;
      vars[varName] = transformOrValidateRecordId(check.targetModel.tableName, targetId);
      const checkVarName = `$exists_${idx}_${idIdx}`;
      statements.push(`LET ${checkVarName} = (SELECT id FROM ONLY $${varName});`);
      statements.push(
        `IF ${checkVarName} IS NONE { THROW "Cannot connect to non-existent ${check.targetModel.name} record" };`,
      );
    });
  });

  return statements;
}

/**
 * Build complete transaction for create with nested operations
 */
export function buildCreateWithNestedTransaction(
  model: ModelMetadata,
  data: Record<string, unknown>,
  nestedOps: Map<string, NestedOperation>,
  registry: ModelRegistry,
  options: NestedWriteOptions = {},
): CompiledQuery {
  const { transactionMode, recordId } = options;
  const ctx = createCompileContext();
  const includeCtx = createCompileContext('inc_');
  const statements: string[] = transactionMode ? [] : ['BEGIN TRANSACTION;'];
  const vars: Record<string, unknown> = {};

  // Track connected IDs that need existence validation
  const connectValidations: TargetCheck[] = [];

  // Track the Record field updates we need to make
  const fieldUpdates: Record<string, string> = {};

  // Track reverse relation operations (executed after main record is created)
  const reverseCreates: Array<{
    targetModel: ModelMetadata;
    createData: Record<string, unknown> | Array<Record<string, unknown>>;
    recordFieldName: string; // The field in target that points to us
  }> = [];

  const reverseConnects: Array<{
    targetModel: ModelMetadata;
    targetIds: RecordIdInput[];
    recordFieldName: string; // The field in target that points to us
    isCreated?: boolean; // True if targetIds are var references (e.g., "$settings.id")
  }> = [];

  // Track array connects for bidirectional sync
  const arrayConnects: Array<{
    targetModel: ModelMetadata;
    targetIds: RecordIdInput[];
    targetRecordField: string;
    isCreated?: boolean; // True if targetIds are var names, false if IDs to transform
    idsVarName?: string; // For connect: the var name containing the array of RecordIds
  }> = [];

  // Process nested operations
  for (const [fieldName, op] of nestedOps) {
    const field = model.fields.find((f) => f.name === fieldName);
    if (!field?.relationInfo) continue;

    const targetModel = registry[field.relationInfo.targetModel];
    if (!targetModel) continue;

    const hasCreate = isNestedCreate(op);
    const hasConnect = isNestedConnect(op);

    // For array relations, handle create and connect separately and merge results
    if (field.isArray && field.relationInfo.fieldRef) {
      const createdVars: string[] = [];
      let connectVarName: string | undefined;

      // Process create operations
      if (hasCreate) {
        const createData = op.create;
        if (field.relationInfo.isReverse) {
          const reverseFieldName = findReverseRecordField(model, targetModel);
          if (reverseFieldName) {
            reverseCreates.push({
              targetModel,
              createData: createData as Record<string, unknown> | Array<Record<string, unknown>>,
              recordFieldName: reverseFieldName,
            });
          }
        } else if (Array.isArray(createData)) {
          createData.forEach((item, idx) => {
            const varName = `$${fieldName}_create${idx}`;
            const contentVarName = `${varName}_content`;
            vars[`${fieldName}_create${idx}_content`] = prepareNestedCreateData(
              item as Record<string, unknown>,
              targetModel,
            );
            statements.push(`LET ${varName} = CREATE ONLY ${targetModel.tableName} CONTENT ${contentVarName};`);
            createdVars.push(`${varName}.id`);
          });
        }
      }

      // Process connect operations
      if (hasConnect) {
        const connectIds = (Array.isArray(op.connect) ? op.connect : [op.connect]) as RecordIdInput[];

        // Track for existence validation
        connectValidations.push({
          targetModel,
          targetIds: connectIds,
          fieldName,
        });

        if (field.relationInfo.isReverse) {
          const reverseFieldName = findReverseRecordField(model, targetModel);
          if (reverseFieldName) {
            reverseConnects.push({
              targetModel,
              targetIds: connectIds,
              recordFieldName: reverseFieldName,
            });
          }
        } else if (Array.isArray(op.connect)) {
          connectVarName = `$${fieldName}_connect`;
          const transformedIds = connectIds.map((id) => transformOrValidateRecordId(targetModel.tableName, id));
          vars[`${fieldName}_connect`] = transformedIds;
        }
      }

      // Build the merged field update for forward array relations
      if (!field.relationInfo.isReverse) {
        if (createdVars.length && connectVarName) {
          // Both create and connect: merge created vars with connect var
          fieldUpdates[field.relationInfo.fieldRef] = `array::concat([${createdVars.join(', ')}], ${connectVarName})`;
        } else if (createdVars.length) {
          // Only create
          fieldUpdates[field.relationInfo.fieldRef] = `[${createdVars.join(', ')}]`;
        } else if (connectVarName) {
          // Only connect
          fieldUpdates[field.relationInfo.fieldRef] = connectVarName;
        }

        // Check for bidirectional n-n and track for sync
        const bidirectional = findBidirectionalNtoNField(model, field, targetModel);
        if (bidirectional) {
          if (createdVars.length) {
            arrayConnects.push({
              targetModel,
              targetIds: createdVars,
              targetRecordField: bidirectional.targetRecordField,
              isCreated: true,
            });
          }
          if (hasConnect && Array.isArray(op.connect)) {
            arrayConnects.push({
              targetModel,
              targetIds: op.connect as RecordIdInput[],
              targetRecordField: bidirectional.targetRecordField,
              idsVarName: `${fieldName}_connect`,
            });
          }
        }
      }
    } else if (hasCreate) {
      // Single relation create
      const createData = op.create;

      if (field.relationInfo.isReverse) {
        const reverseFieldName = findReverseRecordField(model, targetModel);
        if (reverseFieldName) {
          reverseCreates.push({
            targetModel,
            createData: createData as Record<string, unknown> | Array<Record<string, unknown>>,
            recordFieldName: reverseFieldName,
          });
        }
      } else {
        const varName = `$${fieldName}`;
        const contentVarName = `${varName}_content`;
        vars[`${fieldName}_content`] = prepareNestedCreateData(createData as Record<string, unknown>, targetModel);
        statements.push(`LET ${varName} = CREATE ONLY ${targetModel.tableName} CONTENT ${contentVarName};`);

        if (field.relationInfo.fieldRef) {
          fieldUpdates[field.relationInfo.fieldRef] = `${varName}.id`;

          const reverseFieldName = findReverseRecordField(model, targetModel);
          if (reverseFieldName) {
            reverseConnects.push({
              targetModel,
              targetIds: [`${varName}.id`],
              recordFieldName: reverseFieldName,
              isCreated: true,
            });
          }
        }
      }
    } else if (hasConnect) {
      const connectIds = (Array.isArray(op.connect) ? op.connect : [op.connect]) as RecordIdInput[];

      connectValidations.push({
        targetModel,
        targetIds: connectIds,
        fieldName,
      });

      if (field.relationInfo.isReverse) {
        const reverseFieldName = findReverseRecordField(model, targetModel);
        if (reverseFieldName) {
          reverseConnects.push({
            targetModel,
            targetIds: connectIds,
            recordFieldName: reverseFieldName,
          });
        }
      } else if (field.relationInfo.fieldRef) {
        const transformedIds = connectIds.map((id) => transformOrValidateRecordId(targetModel.tableName, id));
        data[field.relationInfo.fieldRef] = transformedIds[0];
      }
    }
  }

  // Add validation for connected records (verify they exist before creating)
  statements.push(...buildTargetCheckStatements(connectValidations, vars));

  // Build the main create with field updates
  const finalData = { ...data };
  for (const key of Object.keys(fieldUpdates)) {
    delete finalData[key];
  }

  // Build field updates (for relation fields from nested creates)
  const fieldUpdateEntries = Object.entries(fieldUpdates);

  // A caller-supplied record id makes this an upsert's create half: the row must land on that record
  // The id part is caller text, so it is bound rather than interpolated
  let createTarget = model.tableName;
  if (recordId) {
    const idBinding = ctx.bind('record', 'id', recordId, 'string');
    Object.assign(vars, idBinding.vars);
    createTarget = idBinding.placeholder;
  }

  // Create the main record
  if (fieldUpdateEntries.length > 0) {
    // Use SET syntax when we have dynamic relation fields
    // Bind each field from finalData as a separate parameter
    const setFields: string[] = [];

    for (const [key, value] of Object.entries(finalData)) {
      const binding = ctx.bind(key, 'set', value, 'string');
      Object.assign(vars, binding.vars);
      setFields.push(`${key} = ${binding.placeholder}`);
    }

    // Add the dynamic relation fields
    for (const [field, value] of fieldUpdateEntries) {
      setFields.push(`${field} = ${value}`);
    }

    statements.push(`LET $result = CREATE ONLY ${createTarget} SET ${setFields.join(', ')};`);
  } else {
    // No dynamic fields, use CONTENT for simplicity
    const contentVar = ctx.bind('content', 'main', finalData, 'string');
    Object.assign(vars, contentVar.vars);
    statements.push(`LET $result = CREATE ONLY ${createTarget} CONTENT ${contentVar.placeholder};`);
  }

  // Store the id in a separate variable for use throughout the transaction
  statements.push(`LET $resultId = $result.id;`);

  // Handle reverse creates (create nested records that point back to us)
  reverseCreates.forEach((rc, idx) => {
    const dataItems = Array.isArray(rc.createData) ? rc.createData : [rc.createData];
    dataItems.forEach((rawItem, itemIdx) => {
      // We need to use SET syntax to include the $resultId reference
      const setFields: string[] = [];
      const item = prepareNestedCreateData(rawItem, rc.targetModel);

      for (const [key, value] of Object.entries(item)) {
        // Skip undefined values (NONE semantics - field doesn't exist)
        if (value === undefined) continue;

        // null values are allowed for optional fields - user explicitly wants null stored
        // Note: For Record fields, null should be skipped (handled in applyNowDefaults)
        const fieldMeta = rc.targetModel.fields.find((f) => f.name === key);
        if (value === null && fieldMeta?.type === 'record') {
          // Record fields shouldn't be null - skip (NONE semantics)
          continue;
        }

        const varName = `rev_${idx}_${itemIdx}_${key}`;
        vars[varName] = value;
        setFields.push(`${key} = $${varName}`);
      }
      setFields.push(`${rc.recordFieldName} = $resultId`);
      statements.push(`CREATE ONLY ${rc.targetModel.tableName} SET ${setFields.join(', ')};`);
    });
  });

  // Handle reverse connects (update existing records to point to us)
  reverseConnects.forEach((rc, syncIdx) => {
    if (rc.isCreated) {
      // For created records, targetIds are var references like "$settings.id"
      rc.targetIds.forEach((varRef) => {
        statements.push(`UPDATE ${varRef} SET ${rc.recordFieldName} = $resultId;`);
      });
    } else {
      // For existing records, transform IDs
      rc.targetIds.forEach((targetId, idx) => {
        const varName = `revcon_${syncIdx}_${idx}`;
        vars[varName] = transformOrValidateRecordId(rc.targetModel.tableName, targetId);
        statements.push(`UPDATE $${varName} SET ${rc.recordFieldName} = $resultId;`);
      });
    }
  });

  // Add bidirectional sync for n-n relations
  arrayConnects.forEach((sync, syncIdx) => {
    if (sync.isCreated) {
      // For created records, targetIds are var names like "$users0.id"
      sync.targetIds.forEach((varRef) => {
        // varRef is like "$users0.id", we need to update "$users0.id"
        statements.push(`UPDATE ${varRef} SET ${sync.targetRecordField} += $resultId;`);
      });
    } else {
      // For connects, update each target individually
      sync.targetIds.forEach((targetId, idx) => {
        const varName = `sync_${syncIdx}_${idx}`;
        vars[varName] = transformOrValidateRecordId(sync.targetModel.tableName, targetId);
        statements.push(`UPDATE $${varName} SET ${sync.targetRecordField} += $resultId;`);
      });
    }
  });

  if (!transactionMode) statements.push('COMMIT TRANSACTION;');
  statements.push(buildNestedReturn('$result', true, model, registry, options, includeCtx));

  return {
    text: statements.join('\n'),
    vars: { ...vars, ...includeCtx.getCollected() },
  };
}

/**
 * Build complete transaction for update with nested operations
 */
export function buildUpdateWithNestedTransaction(
  model: ModelMetadata,
  where: Record<string, unknown>,
  data: Record<string, unknown>,
  nestedOps: Map<string, NestedOperation>,
  registry: ModelRegistry,
  options: NestedWriteOptions = {},
): CompiledQuery {
  const { transactionMode, returnBefore } = options;
  const ctx = createCompileContext();
  const includeCtx = createCompileContext('inc_');
  const statements: string[] = transactionMode ? [] : ['BEGIN TRANSACTION;'];
  const vars: Record<string, unknown> = {};

  // Build where clause for the update
  const whereKeys = Object.keys(where);
  if (whereKeys.length === 0) {
    throw new CerialValidationError('Update requires a where clause', { operation: 'update' });
  }
  // Same clause builder as the plain update path, so every key, filter object and AND/OR/NOT reaches
  // the WHERE and id/Record values are coerced to RecordId in one place
  const whereClause = transformDestructiveWhere(where, model, 'update', registry);
  Object.assign(vars, whereClause.vars);

  // Track the Record field updates we need to make
  const fieldUpdates: string[] = [];

  // Track array connects/disconnects for bidirectional sync
  const arrayConnects: Array<{
    targetModel: ModelMetadata;
    targetIds: RecordIdInput[];
    targetRecordField: string;
    isCreated?: boolean; // True if targetIds are var names, false if IDs to transform
  }> = [];
  const arrayDisconnects: Array<{
    targetModel: ModelMetadata;
    targetIds: RecordIdInput[];
    targetRecordField: string;
  }> = [];

  // Track reverse relation operations that need to update target records
  const reverseDisconnects: Array<{
    targetModel: ModelMetadata;
    targetRecordField: string;
    isTargetFieldNullable?: boolean;
  }> = [];

  const reverseCreates: string[] = [];

  // A forward create must run before the update, which stores the new id, so it cannot wait for
  // $result like the reverse create. It is gated on a pre-read of the where instead: a non-matching
  // where creates nothing, rather than leaving a row nothing links to
  let hasForwardCreate = false;
  const guardedCreate = (varName: string, tableName: string, contentVarName: string): string => {
    hasForwardCreate = true;

    return `LET ${varName} = IF $nested_match[0] { CREATE ONLY ${tableName} CONTENT ${contentVarName} };`;
  };
  const matchInsertAt = statements.length;
  const targetChecks: TargetCheck[] = [];

  const reverseConnects: Array<{
    targetModel: ModelMetadata;
    targetIds: RecordIdInput[];
    targetRecordField: string;
  }> = [];

  // Track set operations for bidirectional sync
  const arraySets: Array<{
    targetModel: ModelMetadata;
    newIds: RecordIdInput[];
    targetRecordField: string;
    sourceRecordField: string;
  }> = [];

  // Process nested operations
  for (const [fieldName, op] of nestedOps) {
    const field = model.fields.find((f) => f.name === fieldName);
    if (!field?.relationInfo) continue;

    const targetModel = registry[field.relationInfo.targetModel];
    if (!targetModel) continue;

    // Check if this is a reverse relation
    if (field.relationInfo.isReverse) {
      const reverseFieldName = findReverseRecordField(model, targetModel);
      if (!reverseFieldName) continue;

      if (isNestedCreate(op)) {
        // Reverse create: the parent id is only known once the where has matched, so the CREATEs are
        // emitted after the main update and take the FK from $result[0].id
        const createData = op.create;
        const items = Array.isArray(createData) ? createData : [createData];

        items.forEach((rawItem, idx) => {
          const varName = `rev_create_${fieldName}_${idx}`;
          const item = prepareNestedCreateData(rawItem, targetModel);
          // Filter out undefined and null record fields
          const itemContent: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(item)) {
            if (value === undefined) continue;
            const fieldMeta = targetModel.fields.find((f) => f.name === key);
            if (value === null && fieldMeta?.type === 'record') continue;
            itemContent[key] = value;
          }
          vars[varName] = itemContent;
          reverseCreates.push(
            `CREATE ${targetModel.tableName} CONTENT object::extend($${varName}, { ${reverseFieldName}: $result[0].id });`,
          );
        });
      } else if (isNestedDisconnect(op)) {
        // Reverse disconnect: update target records to clear their reference
        const targetRecordFieldMeta = targetModel.fields.find((f) => f.name === reverseFieldName);
        reverseDisconnects.push({
          targetModel,
          targetRecordField: reverseFieldName,
          isTargetFieldNullable: targetRecordFieldMeta?.isNullable,
        });
      } else if (isNestedConnect(op)) {
        const connectIds = (Array.isArray(op.connect) ? op.connect : [op.connect]) as RecordIdInput[];
        targetChecks.push({ targetModel, targetIds: connectIds, fieldName });
        reverseConnects.push({
          targetModel,
          targetIds: connectIds,
          targetRecordField: reverseFieldName,
        });
      }
      continue;
    }

    const recordFieldName = field.relationInfo.fieldRef;
    if (!recordFieldName) continue;

    // Find the Record field to determine if it's an array
    const recordField = model.fields.find((f) => f.name === recordFieldName);
    const isArrayField = recordField?.isArray || false;

    if (isNestedCreate(op)) {
      const createData = op.create;

      if (Array.isArray(createData)) {
        // Create multiple records
        const createdVars: string[] = [];
        createData.forEach((item, idx) => {
          const varName = `$${fieldName}${idx}`;
          const contentVarName = `${varName}_content`;
          vars[`${fieldName}${idx}_content`] = prepareNestedCreateData(item, targetModel);
          // CREATE ONLY returns { id: ... }, access .id to get the RecordId
          statements.push(guardedCreate(varName, targetModel.tableName, contentVarName));
          createdVars.push(`${varName}.id`);
        });

        if (isArrayField) {
          fieldUpdates.push(`${recordFieldName} += [${createdVars.join(', ')}]`);

          // Check for bidirectional n-n and track for sync
          const bidirectional = findBidirectionalNtoNField(model, field, targetModel);
          if (bidirectional) {
            arrayConnects.push({
              targetModel,
              targetIds: createdVars, // Use var names instead of IDs
              targetRecordField: bidirectional.targetRecordField,
              isCreated: true,
            });
          }
        } else {
          fieldUpdates.push(`${recordFieldName} = ${createdVars[0]}`);
        }
      } else {
        // Single create
        const varName = `$${fieldName}`;
        const contentVarName = `${varName}_content`;
        vars[`${fieldName}_content`] = prepareNestedCreateData(createData, targetModel);
        // CREATE ONLY returns { id: ... }, access .id to get the RecordId
        statements.push(guardedCreate(varName, targetModel.tableName, contentVarName));

        if (isArrayField) {
          fieldUpdates.push(`${recordFieldName} += ${varName}.id`);
        } else {
          fieldUpdates.push(`${recordFieldName} = ${varName}.id`);
        }
      }
    } else {
      // Handle connect and disconnect - both can be present for array fields
      // Process them independently to support { connect: [...], disconnect: [...] }

      if (isNestedConnect(op)) {
        const connectIds = (Array.isArray(op.connect) ? op.connect : [op.connect]) as RecordIdInput[];
        const varName = `$${fieldName}_connect`;
        const transformedIds = connectIds.map((id) => transformOrValidateRecordId(targetModel.tableName, id));
        vars[`${fieldName}_connect`] = transformedIds;
        targetChecks.push({ targetModel, targetIds: connectIds, fieldName });

        if (isArrayField) {
          // Array connect - add to array using var
          fieldUpdates.push(`${recordFieldName} += ${varName}`);

          // Check for bidirectional n-n
          const bidirectional = findBidirectionalNtoNField(model, field, targetModel);
          if (bidirectional) {
            arrayConnects.push({
              targetModel,
              targetIds: connectIds,
              targetRecordField: bidirectional.targetRecordField,
            });
          }
        } else {
          // Single connect - replace using var (first element)
          fieldUpdates.push(`${recordFieldName} = ${varName}[0]`);
        }
      }

      if (isNestedDisconnect(op)) {
        if (isArrayField) {
          // Array disconnect - remove from array
          const disconnectIds = Array.isArray(op.disconnect) ? op.disconnect : [];
          if (disconnectIds.length) {
            const varName = `$${fieldName}_disconnect`;
            // Transform disconnect IDs to RecordId objects
            const transformedIds = disconnectIds.map((id) =>
              transformOrValidateRecordId(targetModel.tableName, id as string),
            );
            vars[`${fieldName}_disconnect`] = transformedIds;
            fieldUpdates.push(`${recordFieldName} -= ${varName}`);

            // Check for bidirectional n-n
            const bidirectional = findBidirectionalNtoNField(model, field, targetModel);
            if (bidirectional) {
              arrayDisconnects.push({
                targetModel,
                targetIds: disconnectIds as string[],
                targetRecordField: bidirectional.targetRecordField,
              });
            }
          }
        } else {
          // Single disconnect - clear the field (only if field is optional)
          if (!field.isRequired) {
            // @nullable fields use NULL (so it can be queried with { field: null })
            // Non-@nullable fields use NONE (field absent)
            const clearValue = recordField?.isNullable ? 'NULL' : 'NONE';
            fieldUpdates.push(`${recordFieldName} = ${clearValue}`);
          }
        }
      }

      if (isNestedSet(op)) {
        // Set operation - replace all array contents
        if (isArrayField) {
          const setIds = op.set;
          const varName = `$${fieldName}_set`;

          if (setIds.length === 0) {
            // Empty set - clear the array
            fieldUpdates.push(`${recordFieldName} = []`);
          } else {
            // Transform set IDs to RecordId objects
            const transformedIds = setIds.map((id) => transformOrValidateRecordId(targetModel.tableName, id));
            vars[`${fieldName}_set`] = transformedIds;
            targetChecks.push({ targetModel, targetIds: setIds, fieldName });
            fieldUpdates.push(`${recordFieldName} = ${varName}`);
          }

          // For bidirectional n-n, sync both sides using transaction
          const bidirectional = findBidirectionalNtoNField(model, field, targetModel);
          if (bidirectional) {
            // We need to:
            // 1. Remove current record from old items that are not in new set
            // 2. Add current record to new items that were not in old set
            // This is done after the main update using $result[0].{recordFieldName} for old values
            arraySets.push({
              targetModel,
              newIds: setIds,
              targetRecordField: bidirectional.targetRecordField,
              sourceRecordField: recordFieldName,
            });
          }
        }
      }
    }
  }

  // Same SET builder as the plain path, so NONE from `unset`, object sub-fields and tuple elements
  // are written the way the plain update writes them
  const { setParts, setVars } = buildUpdateSetClauses(ctx, data, model);
  fieldUpdates.push(...setParts);
  Object.assign(vars, setVars);

  if (hasForwardCreate) {
    statements.splice(matchInsertAt, 0, `LET $nested_match = (SELECT id FROM ${model.tableName} ${whereClause.text});`);
  }

  // For bidirectional set sync, fetch old values first
  if (arraySets.length > 0) {
    statements.push(`LET $old = (SELECT * FROM ${model.tableName} ${whereClause.text});`);
  }

  // `return: 'before'` needs the row as it was, so it is read before the update and the relation
  // statements that follow; the transaction stays one round trip
  if (returnBefore) {
    const fields = buildSelectFields(options.select, model, options.include, registry, includeCtx);
    statements.push(`LET $before = (SELECT ${fields} FROM ${model.tableName} ${whereClause.text});`);
  }

  // Build the main update
  if (fieldUpdates.length > 0) {
    statements.push(
      `LET $result = (UPDATE ${model.tableName} SET ${fieldUpdates.join(', ')} ${whereClause.text} RETURN *);`,
    );
  } else {
    statements.push(`LET $result = (SELECT * FROM ${model.tableName} ${whereClause.text});`);
  }

  // After the update rather than before it: a statement ahead of a failing UPDATE makes the driver report
  // "failed transaction" in place of the database's own reason. The THROW still rolls everything back
  statements.push(...buildTargetCheckStatements(targetChecks, vars));

  // Statements that act on the matched row only run when the where matched something, so a
  // non-matching where writes nothing, as on the plain path
  const postStatements: string[] = [...reverseCreates];

  // Add bidirectional sync for n-n connects
  arrayConnects.forEach((sync, syncIdx) => {
    if (sync.isCreated) {
      // For created records, targetIds are var names like "$users0.id"
      sync.targetIds.forEach((varRef) => {
        postStatements.push(`UPDATE ${varRef} SET ${sync.targetRecordField} += $result[0].id;`);
      });
    } else {
      // For connected records, use WHERE id INSIDE $array to batch update
      const varName = `sync_connect_ids_${syncIdx}`;
      vars[varName] = sync.targetIds.map((id) => transformOrValidateRecordId(sync.targetModel.tableName, id));
      postStatements.push(
        `UPDATE ${sync.targetModel.tableName} SET ${sync.targetRecordField} += $result[0].id WHERE id INSIDE $${varName};`,
      );
    }
  });

  // Add bidirectional sync for n-n disconnects using WHERE id IN
  arrayDisconnects.forEach((sync, syncIdx) => {
    const varName = `sync_disconnect_ids_${syncIdx}`;
    vars[varName] = sync.targetIds.map((id) => transformOrValidateRecordId(sync.targetModel.tableName, id));
    postStatements.push(
      `UPDATE ${sync.targetModel.tableName} SET ${sync.targetRecordField} -= $result[0].id WHERE id INSIDE $${varName};`,
    );
  });

  // Handle reverse disconnects (update target records to clear their reference)
  reverseDisconnects.forEach((rd) => {
    // @nullable fields use NULL (queryable), non-@nullable fields use NONE (absent)
    const clearValue = rd.isTargetFieldNullable ? 'NULL' : 'NONE';
    // Update all records in target model where the reference points to our record
    postStatements.push(
      `UPDATE ${rd.targetModel.tableName} SET ${rd.targetRecordField} = ${clearValue} WHERE ${rd.targetRecordField} = $result[0].id;`,
    );
  });

  // Handle reverse connects (update target records to point to us)
  reverseConnects.forEach((rc, idx) => {
    const varName = `rev_connect_${idx}`;
    vars[varName] = rc.targetIds.map((id) => transformOrValidateRecordId(rc.targetModel.tableName, id));
    postStatements.push(
      `UPDATE ${rc.targetModel.tableName} SET ${rc.targetRecordField} = $result[0].id WHERE id INSIDE $${varName};`,
    );
  });

  // Handle bidirectional set sync - remove from old, add to new
  arraySets.forEach((setOp, idx) => {
    const newIdsVar = `set_new_${idx}`;
    vars[newIdsVar] = setOp.newIds.map((id) => transformOrValidateRecordId(setOp.targetModel.tableName, id));

    // Remove current record from all old items' arrays
    // $old[0].{sourceRecordField} contains the old array values
    postStatements.push(
      `UPDATE ${setOp.targetModel.tableName} SET ${setOp.targetRecordField} -= $result[0].id WHERE id INSIDE $old[0].${setOp.sourceRecordField};`,
    );

    // Add current record to all new items' arrays
    if (setOp.newIds.length > 0) {
      postStatements.push(
        `UPDATE ${setOp.targetModel.tableName} SET ${setOp.targetRecordField} += $result[0].id WHERE id INSIDE $${newIdsVar};`,
      );
    }
  });

  if (postStatements.length) statements.push(`IF $result[0] {\n${postStatements.join('\n')}\n};`);

  if (!transactionMode) statements.push('COMMIT TRANSACTION;');
  statements.push(
    returnBefore ? 'RETURN $before;' : buildNestedReturn('$result', false, model, registry, options, includeCtx),
  );

  return {
    text: statements.join('\n'),
    vars: { ...vars, ...includeCtx.getCollected() },
  };
}
