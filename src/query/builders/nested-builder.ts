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

import type { ModelMetadata, ModelRegistry } from '../../types';
import { CerialId, type RecordIdInput } from '../../utils/cerial-id';
import type { CompiledQuery } from '../compile/types';
import { createCompileContext } from '../compile/var-allocator';
import { transformOrValidateRecordId } from '../transformers';

/**
 * Apply defaults for nested create data
 * Adds empty arrays for required array fields that are not provided
 * Skips Relation fields (virtual) and Record fields (handled separately)
 */
function applyNestedCreateDefaults(data: Record<string, unknown>, targetModel: ModelMetadata): Record<string, unknown> {
  const result = { ...data };

  for (const field of targetModel.fields) {
    // Skip relation fields (virtual, not stored in DB)
    if (field.type === 'relation') continue;

    // Skip record fields (handled separately in nested operations)
    if (field.type === 'record') continue;

    // Apply empty array default for required array fields that are not provided
    if (field.isArray && field.isRequired && !(field.name in result)) {
      result[field.name] = [];
    }
  }

  return result;
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
 * Build SurrealQL for nested create operation
 * Returns statements to be executed in a transaction
 */
export function buildNestedCreateStatements(
  fieldName: string,
  targetModel: ModelMetadata,
  createData: Record<string, unknown>,
  _parentVarName: string,
): { statements: string[]; varName: string } {
  const ctx = createCompileContext();
  const varName = `$${fieldName}`;

  // Build content variable
  const contentVar = ctx.bind('content', fieldName, createData, 'string');

  // CREATE ONLY returns { id: ... }, access .id to get the RecordId
  const statements = [`LET ${varName} = CREATE ONLY ${targetModel.tableName} CONTENT ${contentVar.placeholder};`];

  return { statements, varName: `${varName}.id` };
}

/**
 * Build SurrealQL for n-n bidirectional sync
 * When connecting A to B, also adds A to B's array
 */
export function buildBidirectionalSyncStatements(
  _sourceModel: ModelMetadata,
  _targetModel: ModelMetadata,
  _sourceFieldName: string,
  targetFieldName: string,
  sourceId: string,
  targetIds: string[],
  operation: 'add' | 'remove',
): string[] {
  const statements: string[] = [];
  const operator = operation === 'add' ? '+=' : '-=';

  for (const targetId of targetIds) {
    // Update target's array to include/exclude source
    statements.push(`UPDATE ${targetId} SET ${targetFieldName} ${operator} ${sourceId};`);
  }

  return statements;
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
    throw new Error(
      `Field "${fieldName}" on model "${model.name}": Cannot specify both "create" and "connect" for single relations (use one or the other)`,
    );
  }

  // create+disconnect doesn't make sense in any context
  if (hasCreate && hasDisconnect) {
    throw new Error(
      `Field "${fieldName}" on model "${model.name}": Cannot specify both "create" and "disconnect" in the same nested operation`,
    );
  }

  // For single relations, connect+disconnect doesn't make sense (just use connect)
  if (hasConnect && hasDisconnect && !field.isArray) {
    throw new Error(
      `Field "${fieldName}" on model "${model.name}": Cannot specify both "connect" and "disconnect" for single relations (use connect alone)`,
    );
  }

  // Check for disconnect on required non-array relation
  // For array relations (Relation[]), disconnect removes items from the array, which is always allowed
  if (hasDisconnect && field.isRequired && !field.isArray) {
    throw new Error(
      `Field "${fieldName}" on model "${model.name}": Cannot disconnect a required relation. ` +
        `Use "connect" to switch to a different record instead.`,
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

/**
 * Build complete transaction for create with nested operations
 */
export function buildCreateWithNestedTransaction(
  model: ModelMetadata,
  data: Record<string, unknown>,
  nestedOps: Map<string, NestedOperation>,
  registry: ModelRegistry,
): CompiledQuery {
  const ctx = createCompileContext();
  const statements: string[] = ['BEGIN TRANSACTION;'];
  const vars: Record<string, unknown> = {};

  // Track connected IDs that need existence validation
  const connectValidations: Array<{
    targetModel: ModelMetadata;
    targetIds: RecordIdInput[];
    fieldName: string;
  }> = [];

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
            // Apply defaults for required array fields
            const itemWithDefaults = applyNestedCreateDefaults(item as Record<string, unknown>, targetModel);
            vars[`${fieldName}_create${idx}_content`] = itemWithDefaults;
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
        // Apply defaults for required array fields
        const dataWithDefaults = applyNestedCreateDefaults(createData as Record<string, unknown>, targetModel);
        vars[`${fieldName}_content`] = dataWithDefaults;
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
  connectValidations.forEach((cv, idx) => {
    cv.targetIds.forEach((targetId, idIdx) => {
      const varName = `validate_${idx}_${idIdx}`;
      vars[varName] = transformOrValidateRecordId(cv.targetModel.tableName, targetId);
      const checkVarName = `$exists_${idx}_${idIdx}`;
      statements.push(`LET ${checkVarName} = (SELECT id FROM ONLY $${varName});`);
      statements.push(
        `IF ${checkVarName} IS NONE { THROW "Cannot connect to non-existent ${cv.targetModel.name} record" };`,
      );
    });
  });

  // Build the main create with field updates
  const finalData = { ...data };
  for (const key of Object.keys(fieldUpdates)) {
    delete finalData[key];
  }

  // Build field updates (for relation fields from nested creates)
  const fieldUpdateEntries = Object.entries(fieldUpdates);

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

    statements.push(`LET $result = CREATE ONLY ${model.tableName} SET ${setFields.join(', ')};`);
  } else {
    // No dynamic fields, use CONTENT for simplicity
    const contentVar = ctx.bind('content', 'main', finalData, 'string');
    Object.assign(vars, contentVar.vars);
    statements.push(`LET $result = CREATE ONLY ${model.tableName} CONTENT ${contentVar.placeholder};`);
  }

  // Store the id in a separate variable for use throughout the transaction
  statements.push(`LET $resultId = $result.id;`);

  // Handle reverse creates (create nested records that point back to us)
  reverseCreates.forEach((rc, idx) => {
    const dataItems = Array.isArray(rc.createData) ? rc.createData : [rc.createData];
    dataItems.forEach((item, itemIdx) => {
      // We need to use SET syntax to include the $resultId reference
      const setFields: string[] = [];

      // First, apply defaults for required array fields that are not provided
      // Skip relation fields (virtual) and record fields (handled separately)
      for (const field of rc.targetModel.fields) {
        if (field.type === 'relation' || field.type === 'record') continue;
        if (field.isArray && field.isRequired && !(field.name in item)) {
          const varName = `rev_${idx}_${itemIdx}_${field.name}`;
          vars[varName] = [];
          setFields.push(`${field.name} = $${varName}`);
        }
      }

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

  statements.push('COMMIT TRANSACTION;');
  // Return the final record - SELECT from the stored id to get updated fields
  statements.push('RETURN SELECT * FROM ONLY $resultId;');

  return {
    text: statements.join('\n'),
    vars,
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
): CompiledQuery {
  const ctx = createCompileContext();
  const statements: string[] = ['BEGIN TRANSACTION;'];
  const vars: Record<string, unknown> = {};

  // Build where clause for the update
  const whereKeys = Object.keys(where);
  if (whereKeys.length === 0) {
    throw new Error('Update requires a where clause');
  }
  const whereField = whereKeys[0] as string;
  let whereValue = where[whereField];

  // Transform id values to RecordId for proper matching
  if (whereField === 'id' && (typeof whereValue === 'string' || CerialId.is(whereValue))) {
    whereValue = transformOrValidateRecordId(model.tableName, whereValue);
  }

  // Transform Record field values to RecordId
  const fieldMeta = model.fields.find((f) => f.name === whereField);
  if (fieldMeta?.type === 'record' && (typeof whereValue === 'string' || CerialId.is(whereValue))) {
    // Find target table from paired Relation field
    const pairedRelation = model.fields.find((f) => f.type === 'relation' && f.relationInfo?.fieldRef === whereField);
    const targetTable = pairedRelation?.relationInfo?.targetTable;
    if (targetTable) {
      whereValue = transformOrValidateRecordId(targetTable, whereValue);
    }
  }

  const whereVar = ctx.bind('where', whereField, whereValue, 'string');
  Object.assign(vars, whereVar.vars);

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
        // Reverse create: create records in target model with FK pointing to parent
        // Include FK directly in content - we have the parent ID from where clause
        const createData = op.create;
        const items = Array.isArray(createData) ? createData : [createData];

        items.forEach((item, idx) => {
          const varName = `rev_create_${fieldName}_${idx}`;
          // Filter out undefined and null record fields, add FK to parent
          const itemContent: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(item)) {
            if (value === undefined) continue;
            const fieldMeta = targetModel.fields.find((f) => f.name === key);
            if (value === null && fieldMeta?.type === 'record') continue;
            itemContent[key] = value;
          }
          // Add FK pointing to parent (whereValue is the parent ID, already transformed)
          itemContent[reverseFieldName] = whereValue;
          vars[varName] = itemContent;
          // Simple CREATE statement
          statements.push(`CREATE ${targetModel.tableName} CONTENT $${varName};`);
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
          vars[`${fieldName}${idx}_content`] = item;
          // CREATE ONLY returns { id: ... }, access .id to get the RecordId
          statements.push(`LET ${varName} = CREATE ONLY ${targetModel.tableName} CONTENT ${contentVarName};`);
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
        vars[`${fieldName}_content`] = createData;
        // CREATE ONLY returns { id: ... }, access .id to get the RecordId
        statements.push(`LET ${varName} = CREATE ONLY ${targetModel.tableName} CONTENT ${contentVarName};`);

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

  // Add regular data updates
  for (const [key, value] of Object.entries(data)) {
    const varBinding = ctx.bind(key, 'set', value, 'string');
    fieldUpdates.push(`${key} = ${varBinding.placeholder}`);
    Object.assign(vars, varBinding.vars);
  }

  // For bidirectional set sync, fetch old values first
  if (arraySets.length > 0) {
    statements.push(`LET $old = (SELECT * FROM ${model.tableName} WHERE ${whereField} = ${whereVar.placeholder});`);
  }

  // Build the main update
  if (fieldUpdates.length > 0) {
    statements.push(
      `LET $result = (UPDATE ${model.tableName} SET ${fieldUpdates.join(', ')} WHERE ${whereField} = ${whereVar.placeholder} RETURN *);`,
    );
  } else {
    statements.push(`LET $result = (SELECT * FROM ${model.tableName} WHERE ${whereField} = ${whereVar.placeholder});`);
  }

  // Add bidirectional sync for n-n connects
  arrayConnects.forEach((sync, syncIdx) => {
    if (sync.isCreated) {
      // For created records, targetIds are var names like "$users0.id"
      sync.targetIds.forEach((varRef) => {
        statements.push(`UPDATE ${varRef} SET ${sync.targetRecordField} += $result[0].id;`);
      });
    } else {
      // For connected records, use WHERE id INSIDE $array to batch update
      const varName = `sync_connect_ids_${syncIdx}`;
      vars[varName] = sync.targetIds.map((id) => transformOrValidateRecordId(sync.targetModel.tableName, id));
      statements.push(
        `UPDATE ${sync.targetModel.tableName} SET ${sync.targetRecordField} += $result[0].id WHERE id INSIDE $${varName};`,
      );
    }
  });

  // Add bidirectional sync for n-n disconnects using WHERE id IN
  arrayDisconnects.forEach((sync, syncIdx) => {
    const varName = `sync_disconnect_ids_${syncIdx}`;
    vars[varName] = sync.targetIds.map((id) => transformOrValidateRecordId(sync.targetModel.tableName, id));
    statements.push(
      `UPDATE ${sync.targetModel.tableName} SET ${sync.targetRecordField} -= $result[0].id WHERE id INSIDE $${varName};`,
    );
  });

  // Handle reverse disconnects (update target records to clear their reference)
  reverseDisconnects.forEach((rd) => {
    // @nullable fields use NULL (queryable), non-@nullable fields use NONE (absent)
    const clearValue = rd.isTargetFieldNullable ? 'NULL' : 'NONE';
    // Update all records in target model where the reference points to our record
    statements.push(
      `UPDATE ${rd.targetModel.tableName} SET ${rd.targetRecordField} = ${clearValue} WHERE ${rd.targetRecordField} = $result[0].id;`,
    );
  });

  // Handle reverse connects (update target records to point to us)
  reverseConnects.forEach((rc, idx) => {
    const varName = `rev_connect_${idx}`;
    vars[varName] = rc.targetIds.map((id) => transformOrValidateRecordId(rc.targetModel.tableName, id));
    statements.push(
      `UPDATE ${rc.targetModel.tableName} SET ${rc.targetRecordField} = $result[0].id WHERE id INSIDE $${varName};`,
    );
  });

  // Handle bidirectional set sync - remove from old, add to new
  arraySets.forEach((setOp, idx) => {
    const newIdsVar = `set_new_${idx}`;
    vars[newIdsVar] = setOp.newIds.map((id) => transformOrValidateRecordId(setOp.targetModel.tableName, id));

    // Remove current record from all old items' arrays
    // $old[0].{sourceRecordField} contains the old array values
    statements.push(
      `UPDATE ${setOp.targetModel.tableName} SET ${setOp.targetRecordField} -= $result[0].id WHERE id INSIDE $old[0].${setOp.sourceRecordField};`,
    );

    // Add current record to all new items' arrays
    if (setOp.newIds.length > 0) {
      statements.push(
        `UPDATE ${setOp.targetModel.tableName} SET ${setOp.targetRecordField} += $result[0].id WHERE id INSIDE $${newIdsVar};`,
      );
    }
  });

  statements.push('COMMIT TRANSACTION;');
  statements.push('RETURN $result;');

  return {
    text: statements.join('\n'),
    vars,
  };
}
