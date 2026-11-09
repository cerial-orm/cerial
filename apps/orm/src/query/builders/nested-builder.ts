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
import type { TargetCheckMap } from '../compile/types';
import type { PartsCompiledQuery, StatementParts } from '../executor';
import { createCompileContext, type FilterCompileContext } from '../compile/var-allocator';
import { transformDestructiveWhere } from '../filters/transformer';
import { applyFieldDefaults, modelIdTypes, transformData, transformOrValidateRecordId } from '../transformers';
import { validateCreateData, validateNoNestedWrites, validateRelationValue } from '../validators/data-validator';
import { validationFailure } from '../validators/failure';
import { captureMatchedIds } from './bulk-write';
import type { IncludeClause } from './relation-builder';
import { buildSelectFields } from './select-builder';
import { buildUpdateSetClauses } from './update-builder';

/**
 * Run a nested create's data through the same steps as a plain create: field defaults, then wrapper
 * and RecordId transformation against the target model. Without this the nested row is written from
 * raw input, so a Date string, a CerialUuid or a Decimal reaches SurrealDB untransformed.
 */
function prepareNestedCreateData(
  data: Record<string, unknown>,
  targetModel: ModelMetadata,
  path: string,
  deferredField?: string,
): Record<string, unknown> {
  // Same validation as a top-level create, before any transform. An undeclared key is refused here too:
  // a reverse create writes each key as a column name, so it must not reach query text
  const withDefaults = applyFieldDefaults(data, targetModel);
  const validation = validateCreateData(withDefaults, targetModel);
  // A reverse create receives its foreign key from the parent row, after this runs
  const problems = validation.errors.filter((e) => e.field !== deferredField);
  if (problems.length) throw validationFailure('data', problems, targetModel, 'create');

  // A nested write inside a nested create has no emitted form; refuse it rather than drop it
  const deep = validateNoNestedWrites(data, targetModel, path);
  if (deep.length)
    throw new CerialValidationError(`Invalid data: ${deep.map((e) => e.message).join('; ')}`, {
      model: targetModel.name,
      field: deep[0]!.field,
    });

  return transformData(withDefaults, targetModel);
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
      const bad = validateRelationValue(field, value, model);
      if (bad) throw new CerialValidationError(`Invalid data: ${bad.message}`, { model: model.name, field: key });
      // Validate the nested operation
      validateNestedOperation(key, value, field, model);
      nestedOps.set(key, value);
    } else if (field) {
      const bad = validateRelationValue(field, value, model);
      if (bad) throw new CerialValidationError(`Invalid data: ${bad.message}`, { model: model.name, field: key });
      cleanData[key] = value;
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
  /** Inside an outer transaction: emit no BEGIN/COMMIT and no target check; the caller hoists the check */
  transactionMode?: boolean;
  /**
   * Create only: the record the row must be created as, in place of a server-generated id. Upsert's
   * create half passes the id from its `where`, the same record the plain upsert's CREATE targets
   */
  recordId?: RecordId;
  /** The public call, named in the error a missing connect or set target raises; defaults to the builder's own */
  operation?: string;
  /** Update only: return the row as it was before the write, projected through `select` and `include` */
  returnBefore?: boolean;
  select?: SelectClause;
  include?: IncludeClause;
  /** Update only: write the first row the where matches, not every match (upsert is single-row) */
  firstOnly?: boolean;
  /** Names already issued in the statement this call is a half of, so two halves never reuse a variable */
  issued?: Set<string>;
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

/**
 * The statements by position, so the executor and the upsert builder never search the text for the wrapper or
 * the RETURN, which a caller-chosen key in the projection could spell.
 */
function nestedParts(
  statements: string[],
  returnStatement: string,
  transactionMode: boolean | undefined,
  guarded: boolean,
): StatementParts {
  // [BEGIN, header, body, RETURN, '};', COMMIT]: the RETURN sits inside the block
  if (guarded) return { body: statements.slice(1, -1).join('\n') };
  // [body, RETURN]
  if (transactionMode) return { body: statements.slice(0, -1).join('\n'), ret: returnStatement };

  // [BEGIN, body, COMMIT, RETURN]
  return { body: statements.slice(1, -2).join('\n'), ret: returnStatement };
}

export interface TargetCheck {
  targetModel: ModelMetadata;
  targetIds: RecordIdInput[];
  fieldName: string;
}

/** A `connect` or `set` in `nestedOps`, with the record ids it links to */
export interface NestedTargetCheck extends TargetCheck {
  verb: 'connect' | 'set';
}

/**
 * The records a write links to, in the order a missing one is reported: fields in `nestedOps` order,
 * `connect` before `set` within a field. `disconnect` is not checked: removing a link that does not exist
 * leaves the state the caller asked for.
 */
export function collectTargetChecks(
  model: ModelMetadata,
  nestedOps: Map<string, NestedOperation>,
  registry: ModelRegistry,
): NestedTargetCheck[] {
  const checks: NestedTargetCheck[] = [];
  for (const [fieldName, op] of nestedOps) {
    const field = model.fields.find((f) => f.name === fieldName);
    const targetModel = field?.relationInfo ? registry[field.relationInfo.targetModel] : undefined;
    if (!targetModel) continue;

    if (isNestedConnect(op)) {
      const ids = (Array.isArray(op.connect) ? op.connect : [op.connect]) as RecordIdInput[];
      if (ids.length) checks.push({ targetModel, targetIds: ids, fieldName, verb: 'connect' });
    }
    if (isNestedSet(op) && op.set.length) checks.push({ targetModel, targetIds: op.set, fieldName, verb: 'set' });
  }

  return checks;
}

interface TargetGuard {
  /** Statements that open the guard, placed right after BEGIN */
  header: string[];
  map: TargetCheckMap;
}

/**
 * One existence read per linked record, in report order, and the side table entry each read maps to. The
 * binding names carry `varPrefix` so two halves of one query cannot collide.
 */
export function buildTargetReads(
  checks: NestedTargetCheck[],
  vars: Record<string, unknown>,
  varPrefix = '',
): { reads: string[]; entries: TargetCheckMap['entries'][number][] } {
  const reads: string[] = [];
  const entries: TargetCheckMap['entries'][number][] = [];
  checks.forEach((check, idx) => {
    check.targetIds.forEach((targetId, idIdx) => {
      const varName = `${varPrefix}validate_${idx}_${idIdx}`;
      const recordId = transformOrValidateRecordId(
        check.targetModel.tableName,
        targetId,
        modelIdTypes(check.targetModel),
      );
      vars[varName] = recordId;
      reads.push(`(SELECT VALUE id FROM ONLY $${varName})`);
      entries.push({
        field: check.fieldName,
        verb: check.verb,
        targetModel: check.targetModel.name,
        id: recordId.toString(),
      });
    });
  });

  return { reads, entries };
}

/**
 * Reads every linked record and returns the position of the first missing one, or NONE. The write sits
 * in an IF block that runs only when none is missing, so a missing record raises no database error: the
 * executor reads the returned position and throws the typed error. `at` is the RETURN's index in the
 * results of the text with its BEGIN.
 */
function buildTargetGuard(
  checks: NestedTargetCheck[],
  vars: Record<string, unknown>,
  model: ModelMetadata,
  operation: string,
): TargetGuard | null {
  if (!checks.length) return null;

  const { reads, entries } = buildTargetReads(checks, vars);

  return {
    header: [
      `LET $target_missing = [${reads.join(', ')}].find_index(NONE);`,
      'RETURN $target_missing;',
      'IF $target_missing IS NONE {',
    ],
    map: { at: 2, model: model.name, operation, entries },
  };
}

/** A reverse disconnect or set: the rows of the target model that carry this record's foreign key */
interface ReverseUnlink {
  targetModel: ModelMetadata;
  targetRecordField: string;
  isTargetFieldNullable?: boolean;
  /** The foreign key is a Record[], so this record is removed from the array rather than the field cleared */
  isArrayField: boolean;
  /** The variable holding the named ids */
  idsVar: string;
  hasIds: boolean;
  /** `disconnect: true`: every row that points at this record, named or not */
  all?: true;
}

/**
 * Unlink this record from the target rows `rowFilter` selects, among those that currently point at it. A
 * single foreign key is cleared (NULL when @nullable, so it can still be queried, else NONE); an array key
 * loses only this record. A required key cannot be cleared, so the database refuses it, naming the field.
 */
function reverseUnlinkStatement(rd: ReverseUnlink, rowFilter: string): string {
  const { targetModel, targetRecordField: fk } = rd;
  if (rd.isArrayField)
    return `UPDATE ${targetModel.tableName} SET ${fk} -= $result[0].id WHERE ${fk} CONTAINS $result[0].id AND ${rowFilter};`;

  return `UPDATE ${targetModel.tableName} SET ${fk} = ${rd.isTargetFieldNullable ? 'NULL' : 'NONE'} WHERE ${fk} = $result[0].id AND ${rowFilter};`;
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
): PartsCompiledQuery {
  const { transactionMode, recordId } = options;
  const ctx = createCompileContext('', options.issued);
  const includeCtx = createCompileContext('inc_', ctx.issued);
  const statements: string[] = transactionMode ? [] : ['BEGIN TRANSACTION;'];
  const vars: Record<string, unknown> = {};

  // Track the Record field updates we need to make
  const fieldUpdates: Record<string, string> = {};

  // Track reverse relation operations (executed after main record is created)
  const reverseCreates: Array<{
    targetModel: ModelMetadata;
    createData: Record<string, unknown> | Array<Record<string, unknown>>;
    recordFieldName: string; // The field in target that points to us
    fieldName: string;
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
      let connectName: string | undefined;

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
              fieldName,
            });
          }
        } else if (Array.isArray(createData)) {
          createData.forEach((item, idx) => {
            const varName = `$${ctx.name('nested_create')}`;
            const contentName = ctx.name('nested_content');
            const contentVarName = `$${contentName}`;
            vars[contentName] = prepareNestedCreateData(
              item as Record<string, unknown>,
              targetModel,
              `${fieldName}[${idx}]`,
            );
            statements.push(`LET ${varName} = CREATE ONLY ${targetModel.tableName} CONTENT ${contentVarName};`);
            createdVars.push(`${varName}.id`);
          });
        }
      }

      // Process connect operations
      if (hasConnect) {
        const connectIds = (Array.isArray(op.connect) ? op.connect : [op.connect]) as RecordIdInput[];

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
          connectName = ctx.name('nested_connect');
          connectVarName = `$${connectName}`;
          const transformedIds = connectIds.map((id) =>
            transformOrValidateRecordId(targetModel.tableName, id, modelIdTypes(targetModel)),
          );
          vars[connectName] = transformedIds;
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
              idsVarName: connectName,
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
            fieldName,
          });
        }
      } else {
        const varName = `$${ctx.name('nested_create')}`;
        const contentName = ctx.name('nested_content');
        const contentVarName = `$${contentName}`;
        vars[contentName] = prepareNestedCreateData(createData as Record<string, unknown>, targetModel, fieldName);
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
        const transformedIds = connectIds.map((id) =>
          transformOrValidateRecordId(targetModel.tableName, id, modelIdTypes(targetModel)),
        );
        data[field.relationInfo.fieldRef] = transformedIds[0];
      }
    }
  }

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
  reverseCreates.forEach((rc) => {
    const dataItems = Array.isArray(rc.createData) ? rc.createData : [rc.createData];
    dataItems.forEach((rawItem, itemIdx) => {
      // We need to use SET syntax to include the $resultId reference
      const setFields: string[] = [];
      const item = prepareNestedCreateData(
        rawItem,
        rc.targetModel,
        Array.isArray(rc.createData) ? `${rc.fieldName}[${itemIdx}]` : rc.fieldName,
        rc.recordFieldName,
      );

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

        const varName = ctx.name('nested_rev');
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
        vars[varName] = transformOrValidateRecordId(rc.targetModel.tableName, targetId, modelIdTypes(rc.targetModel));
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
        vars[varName] = transformOrValidateRecordId(
          sync.targetModel.tableName,
          targetId,
          modelIdTypes(sync.targetModel),
        );
        statements.push(`UPDATE $${varName} SET ${sync.targetRecordField} += $resultId;`);
      });
    }
  });

  const returnStatement = buildNestedReturn('$result', true, model, registry, options, includeCtx);
  const guard = transactionMode
    ? null
    : buildTargetGuard(collectTargetChecks(model, nestedOps, registry), vars, model, options.operation ?? 'create');
  if (guard) {
    // After BEGIN; the block scopes its LETs, so the RETURN that reads them moves inside it
    statements.splice(1, 0, ...guard.header);
    statements.push(returnStatement, '};', 'COMMIT TRANSACTION;');
  } else {
    if (!transactionMode) statements.push('COMMIT TRANSACTION;');
    statements.push(returnStatement);
  }

  return {
    text: statements.join('\n'),
    vars: { ...vars, ...includeCtx.getCollected() },
    ...(guard && { targetCheck: guard.map }),
    parts: nestedParts(statements, returnStatement, transactionMode, !!guard),
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
): PartsCompiledQuery {
  const { transactionMode, returnBefore } = options;
  const ctx = createCompileContext('', options.issued);
  const includeCtx = createCompileContext('inc_', ctx.issued);
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
  for (const name of Object.keys(whereClause.vars)) ctx.issued.add(name);
  const scope = options.firstOnly ? `${whereClause.text} LIMIT 1` : whereClause.text;
  const matched = captureMatchedIds(ctx, model.tableName, scope);

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
  const reverseDisconnects: ReverseUnlink[] = [];
  const reverseSets: ReverseUnlink[] = [];

  const reverseCreates: string[] = [];

  // A forward create must run before the update, which stores the new id, so it cannot wait for
  // $result like the reverse create. It is gated on a pre-read of the where instead: a non-matching
  // where creates nothing, rather than leaving a row nothing links to
  const guardedCreate = (varName: string, tableName: string, contentVarName: string): string => {
    return `LET ${varName} = IF ${matched.target}[0] { CREATE ONLY ${tableName} CONTENT ${contentVarName} };`;
  };
  const matchInsertAt = statements.length;

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
          const varName = ctx.name('nested_rev_create');
          const item = prepareNestedCreateData(
            rawItem,
            targetModel,
            Array.isArray(createData) ? `${fieldName}[${idx}]` : fieldName,
            reverseFieldName,
          );
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
      }
      const targetRecordFieldMeta = targetModel.fields.find((f) => f.name === reverseFieldName);
      const unlink = (ids: RecordIdInput[], prefix: string): ReverseUnlink => {
        const idsVar = ctx.name(prefix);
        vars[idsVar] = ids.map((id) =>
          transformOrValidateRecordId(targetModel.tableName, id, modelIdTypes(targetModel)),
        );

        return {
          targetModel,
          targetRecordField: reverseFieldName,
          isTargetFieldNullable: targetRecordFieldMeta?.isNullable,
          isArrayField: !!targetRecordFieldMeta?.isArray,
          idsVar,
          hasIds: ids.length > 0,
        };
      };
      if (isNestedDisconnect(op)) {
        // Only the named rows are unlinked, and only those that point at this record. `true` is the one form
        // that names no row and means all of them; `false` names none
        if (op.disconnect === true) reverseDisconnects.push({ ...unlink([], 'rev_disconnect'), all: true });
        else if (op.disconnect !== false) {
          const named = (Array.isArray(op.disconnect) ? op.disconnect : [op.disconnect]) as RecordIdInput[];
          if (named.length) reverseDisconnects.push(unlink(named, 'rev_disconnect'));
        }
      }
      if (isNestedConnect(op)) {
        const connectIds = (Array.isArray(op.connect) ? op.connect : [op.connect]) as RecordIdInput[];
        reverseConnects.push({
          targetModel,
          targetIds: connectIds,
          targetRecordField: reverseFieldName,
        });
      }
      if (isNestedSet(op)) reverseSets.push(unlink(op.set, 'rev_set'));
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
          const varName = `$${ctx.name('nested_create')}`;
          const contentName = ctx.name('nested_content');
          const contentVarName = `$${contentName}`;
          vars[contentName] = prepareNestedCreateData(item, targetModel, `${fieldName}[${idx}]`);
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
        const varName = `$${ctx.name('nested_create')}`;
        const contentName = ctx.name('nested_content');
        const contentVarName = `$${contentName}`;
        vars[contentName] = prepareNestedCreateData(createData, targetModel, fieldName);
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
        const connectName = ctx.name('nested_connect');
        const varName = `$${connectName}`;
        const transformedIds = connectIds.map((id) =>
          transformOrValidateRecordId(targetModel.tableName, id, modelIdTypes(targetModel)),
        );
        vars[connectName] = transformedIds;

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
          // A single id disconnects that id, as connect takes one; `true` and `false` name no id
          const disconnectIds =
            typeof op.disconnect === 'boolean' ? [] : Array.isArray(op.disconnect) ? op.disconnect : [op.disconnect];
          if (disconnectIds.length) {
            const disconnectName = ctx.name('nested_disconnect');
            const varName = `$${disconnectName}`;
            // Transform disconnect IDs to RecordId objects
            const transformedIds = disconnectIds.map((id) =>
              transformOrValidateRecordId(targetModel.tableName, id as string, modelIdTypes(targetModel)),
            );
            vars[disconnectName] = transformedIds;
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
          const setName = ctx.name('nested_set');
          const varName = `$${setName}`;

          if (setIds.length === 0) {
            // Empty set - clear the array
            fieldUpdates.push(`${recordFieldName} = []`);
          } else {
            // Transform set IDs to RecordId objects
            const transformedIds = setIds.map((id) =>
              transformOrValidateRecordId(targetModel.tableName, id, modelIdTypes(targetModel)),
            );
            vars[setName] = transformedIds;
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

  // The matched ids are read before anything is written, and the update writes exactly those: the where is
  // not re-run against rows the update or a nested create has already changed
  statements.splice(matchInsertAt, 0, `${matched.statement};`);

  // For bidirectional set sync, fetch old values first
  if (arraySets.length > 0) {
    statements.push(`LET $old = (SELECT * FROM ${model.tableName} ${scope});`);
  }

  // `return: 'before'` needs the row as it was, so it is read before the update and the relation
  // statements that follow; the transaction stays one round trip
  if (returnBefore) {
    const fields = buildSelectFields(options.select, model, options.include, registry, includeCtx);
    statements.push(`LET $prior = (SELECT ${fields} FROM ${model.tableName} ${scope});`);
  }

  // Build the main update
  if (fieldUpdates.length > 0) {
    statements.push(`LET $result = (UPDATE ${matched.target} SET ${fieldUpdates.join(', ')} RETURN *);`);
  } else {
    statements.push(`LET $result = (SELECT * FROM ${model.tableName} ${scope});`);
  }

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
      vars[varName] = sync.targetIds.map((id) =>
        transformOrValidateRecordId(sync.targetModel.tableName, id, modelIdTypes(sync.targetModel)),
      );
      postStatements.push(
        `UPDATE ${sync.targetModel.tableName} SET ${sync.targetRecordField} += $result[0].id WHERE id INSIDE $${varName};`,
      );
    }
  });

  // Add bidirectional sync for n-n disconnects using WHERE id IN
  arrayDisconnects.forEach((sync, syncIdx) => {
    const varName = `sync_disconnect_ids_${syncIdx}`;
    vars[varName] = sync.targetIds.map((id) =>
      transformOrValidateRecordId(sync.targetModel.tableName, id, modelIdTypes(sync.targetModel)),
    );
    postStatements.push(
      `UPDATE ${sync.targetModel.tableName} SET ${sync.targetRecordField} -= $result[0].id WHERE id INSIDE $${varName};`,
    );
  });

  // Handle reverse disconnects: clear the reference on the named rows that point at this record
  reverseDisconnects.forEach((rd) =>
    postStatements.push(reverseUnlinkStatement(rd, rd.all ? 'true' : `id INSIDE $${rd.idsVar}`)),
  );

  // Handle reverse connects (update target records to point to us)
  reverseConnects.forEach((rc, idx) => {
    const varName = `rev_connect_${idx}`;
    vars[varName] = rc.targetIds.map((id) =>
      transformOrValidateRecordId(rc.targetModel.tableName, id, modelIdTypes(rc.targetModel)),
    );
    postStatements.push(
      `UPDATE ${rc.targetModel.tableName} SET ${rc.targetRecordField} = $result[0].id WHERE id INSIDE $${varName};`,
    );
  });

  // Reverse set: the named rows point at this record and no other row does
  reverseSets.forEach((rs) => {
    const { targetModel, targetRecordField: fk } = rs;
    postStatements.push(reverseUnlinkStatement(rs, `!(id INSIDE $${rs.idsVar})`));
    if (!rs.hasIds) return;
    postStatements.push(
      rs.isArrayField
        ? `UPDATE ${targetModel.tableName} SET ${fk} += $result[0].id WHERE id INSIDE $${rs.idsVar} AND !(${fk} CONTAINS $result[0].id);`
        : `UPDATE ${targetModel.tableName} SET ${fk} = $result[0].id WHERE id INSIDE $${rs.idsVar};`,
    );
  });

  // Handle bidirectional set sync - remove from old, add to new
  arraySets.forEach((setOp, idx) => {
    const newIdsVar = `set_new_${idx}`;
    vars[newIdsVar] = setOp.newIds.map((id) =>
      transformOrValidateRecordId(setOp.targetModel.tableName, id, modelIdTypes(setOp.targetModel)),
    );

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

  const returnStatement = returnBefore
    ? 'RETURN $prior;'
    : buildNestedReturn('$result', false, model, registry, options, includeCtx);
  const guard = transactionMode
    ? null
    : buildTargetGuard(collectTargetChecks(model, nestedOps, registry), vars, model, options.operation ?? 'updateMany');
  if (guard) {
    // After BEGIN; the block scopes its LETs, so the RETURN that reads them moves inside it
    statements.splice(1, 0, ...guard.header);
    statements.push(returnStatement, '};', 'COMMIT TRANSACTION;');
  } else {
    if (!transactionMode) statements.push('COMMIT TRANSACTION;');
    statements.push(returnStatement);
  }

  return {
    text: statements.join('\n'),
    vars: { ...vars, ...includeCtx.getCollected() },
    ...(guard && { targetCheck: guard.map }),
    parts: nestedParts(statements, returnStatement, transactionMode, !!guard),
  };
}
