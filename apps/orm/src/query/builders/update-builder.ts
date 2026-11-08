/**
 * UPDATE query builder
 */

import type {
  FieldMetadata,
  ModelMetadata,
  ModelRegistry,
  ObjectFieldMetadata,
  SelectClause,
  TupleElementMetadata,
  TupleFieldMetadata,
  UpdateUniqueReturn,
  WhereClause,
} from '../../types';
import { isNone, NONE } from '../../utils/none';
import { quoteSubKey } from '../../utils/string-utils';
import { bindWithInlineExpressions, isInlineExpression } from '../compile/inline-expression';
import type { CompiledQuery } from '../compile/types';
import { createCompileContext, type FilterCompileContext } from '../compile/var-allocator';
import { transformDestructiveWhere } from '../filters/transformer';
import { captureMatchedIds, inTransaction } from './bulk-write';
import { transformOrValidateRecordId, tupleElementUpdateRefresh } from '../transformers';
import { buildArrayUpdateClause, isArrayField, isArrayUpdateOps } from './array-update-builder';
import { getRecordIdFromWhere } from './delete-builder';
import { combineSelectWithIncludes, type IncludeClause } from './relation-builder';
import { buildBeforeSnapshot, buildSelectFields, needsBeforeSnapshot } from './select-builder';

/**
 * Merge unset fields into data as NONE values.
 * This allows the existing builder infrastructure to handle unset uniformly.
 *
 * - `true` → NONE (clear entire field)
 * - Object → recursively merge sub-field unsets as NONE
 * - Data takes priority: if a field is in both data and unset, data wins
 */
export function mergeUnsetIntoData(
  data: Record<string, unknown>,
  unset: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...data };

  for (const [key, unsetValue] of Object.entries(unset)) {
    if (unsetValue === undefined) continue;

    if (unsetValue === true) {
      // Only set NONE if not already in data (data takes priority)
      if (!(key in merged) || merged[key] === undefined) {
        merged[key] = NONE;
      }
      continue;
    }

    // Sub-field unset (object or tuple)
    if (typeof unsetValue === 'object' && unsetValue !== null) {
      const existingValue = merged[key];

      if (
        typeof existingValue === 'object' &&
        existingValue !== null &&
        !isNone(existingValue) &&
        !Array.isArray(existingValue)
      ) {
        // Data already has an object at this key — deep merge
        merged[key] = mergeUnsetIntoData(
          existingValue as Record<string, unknown>,
          unsetValue as Record<string, unknown>,
        );
      } else if (existingValue === undefined) {
        // Data doesn't have this field — convert all unset entries to NONE
        merged[key] = convertUnsetToNoneValues(unsetValue as Record<string, unknown>);
      }
      // If data has a non-object value (NONE, primitive, array), data wins
    }
  }

  return merged;
}

/** Convert an unset sub-tree to NONE values */
export function convertUnsetToNoneValues(unset: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(unset)) {
    if (value === true) {
      result[key] = NONE;
    } else if (typeof value === 'object' && value !== null) {
      result[key] = convertUnsetToNoneValues(value as Record<string, unknown>);
    }
  }

  return result;
}

/**
 * Inject NONE for @updatedAt and @defaultAlways fields not already in the update data.
 * SurrealDB DEFAULT ALWAYS only re-fires when the field is explicitly set to NONE.
 * Without this, UPDATE queries that omit these fields would preserve the old value.
 *
 * Also strips @now (COMPUTED) fields from update data — they are not stored in the DB.
 */
function injectDefaultAlwaysFieldsForUpdate(
  data: Record<string, unknown>,
  model: ModelMetadata,
  setParts: string[],
): Set<string> {
  const processedFields = new Set<string>();

  for (const field of model.fields) {
    // Strip @now (COMPUTED) fields — they are computed at query time, not stored
    if (field.timestampDecorator === 'now') {
      processedFields.add(field.name);
      continue;
    }

    // Strip @readonly fields — they cannot be updated, and NONE should not be injected
    if (field.isReadonly) {
      processedFields.add(field.name);
      continue;
    }

    // Inject NONE for @updatedAt fields not provided by user
    if (field.timestampDecorator === 'updatedAt' && !(field.name in data)) {
      setParts.push(`${field.name} = NONE`);
      processedFields.add(field.name);
    }

    // Inject NONE for @defaultAlways fields not provided by user
    if (field.defaultAlwaysValue !== undefined && !(field.name in data)) {
      setParts.push(`${field.name} = NONE`);
      processedFields.add(field.name);
    }
  }

  return processedFields;
}

/**
 * Build SET clauses for update data, handling objects, tuples, arrays, NONE, null, etc.
 * Shared by both UPDATE and UPSERT (ID-based) builders.
 *
 * @param ctx - Compile context for variable binding
 * @param data - Transformed update data (may include NONE sentinels from unset merge)
 * @param model - Model metadata for field lookup
 * @param varPrefix - Prefix for variable names (e.g., 'set' for update, 'update' for upsert)
 * @returns Set clause parts and variables
 */
export function buildUpdateSetClauses(
  ctx: FilterCompileContext,
  data: Record<string, unknown>,
  model: ModelMetadata,
  varPrefix: string = 'set',
): { setParts: string[]; setVars: Record<string, unknown> } {
  const setVars: Record<string, unknown> = {};
  const setParts: string[] = [];

  // Inject NONE for @updatedAt/@defaultAlways fields and strip @now fields
  const timestampFields = injectDefaultAlwaysFieldsForUpdate(data, model, setParts);

  for (const [field, value] of Object.entries(data)) {
    if (value === undefined) continue;

    // Skip fields already handled by timestamp injection
    if (timestampFields.has(field)) continue;

    // Find field metadata
    const fieldMetadata = model.fields.find((f) => f.name === field);

    // NONE sentinel → always emit field = NONE (clear the field)
    if (isNone(value)) {
      setParts.push(`${field} = NONE`);
      continue;
    }

    // Handle null values based on @nullable
    if (value === null && fieldMetadata) {
      if (fieldMetadata.isNullable) {
        // @nullable field → emit parameterized NULL (SurrealDB stores null)
        const varBinding = ctx.bind(field, varPrefix, null, fieldMetadata.type);
        setParts.push(`${field} = ${varBinding.placeholder}`);
        Object.assign(setVars, varBinding.vars);
      } else {
        // Non-@nullable field → emit NONE (clear the field / set absent)
        setParts.push(`${field} = NONE`);
      }
      continue;
    }

    // Handle object fields with merge/set/array operations
    if (fieldMetadata?.type === 'object' && fieldMetadata.objectInfo) {
      buildObjectUpdateClauses(ctx, field, value, fieldMetadata, setParts, setVars);
      continue;
    }

    // Handle single tuple: array = full replace, object = per-element update
    if (fieldMetadata?.type === 'tuple' && fieldMetadata.tupleInfo && !fieldMetadata.isArray) {
      if (!Array.isArray(value) && typeof value === 'object' && value !== null) {
        // Object form = per-element update
        buildTupleUpdateClauses(
          ctx,
          field,
          value as Record<string, unknown>,
          fieldMetadata.tupleInfo,
          setParts,
          setVars,
        );
      } else {
        // Array form = full tuple replace
        const rendered = bindWithInlineExpressions(ctx, field, varPrefix, value, fieldMetadata.type);
        setParts.push(`${field} = ${rendered.text}`);
        Object.assign(setVars, rendered.vars);
      }
      continue;
    }

    // Handle array fields with push/unset/set operations (covers Record[], Tuple[], primitives)
    if (fieldMetadata && isArrayField(fieldMetadata) && (Array.isArray(value) || isArrayUpdateOps(value))) {
      const arrayUpdate = buildArrayUpdateClause(ctx, field, value, fieldMetadata);
      if (arrayUpdate.clause) {
        setParts.push(arrayUpdate.clause);
        Object.assign(setVars, arrayUpdate.vars);
      }
      continue;
    }

    // Standard field update
    const varBinding = ctx.bind(field, varPrefix, value, fieldMetadata?.type || 'string');
    setParts.push(`${field} = ${varBinding.placeholder}`);
    Object.assign(setVars, varBinding.vars);
  }

  return { setParts, setVars };
}

/** Build UPDATE query */
export function buildUpdateManyQuery(
  model: ModelMetadata,
  where: WhereClause,
  data: Record<string, unknown>,
  select?: SelectClause,
  unset?: Record<string, unknown>,
  registry?: ModelRegistry,
  include?: IncludeClause,
): CompiledQuery {
  const ctx = createCompileContext();

  // Merge unset into data as NONE values so the builder handles everything uniformly
  const mergedData = unset ? mergeUnsetIntoData(data, unset) : data;

  // Build SET clauses
  const { setParts, setVars } = buildUpdateSetClauses(ctx, mergedData, model);

  // Build WHERE clause
  const whereClause = transformDestructiveWhere(where, model, 'updateMany', registry);

  // Build select fields for RETURN
  const includeCtx = createCompileContext('inc_');
  const fields = buildSelectFields(select, model, include, registry, includeCtx);

  const vars = { ...setVars, ...whereClause.vars, ...includeCtx.getCollected() };
  const setText = setParts.length > 0 ? `SET ${setParts.join(', ')}` : '';

  // Without a filter every row is written, so there is nothing to evaluate twice
  if (!whereClause.text)
    return { text: [`UPDATE ${model.tableName}`, setText, `RETURN ${fields}`].filter((p) => p).join(' '), vars };

  // Select the ids first and write exactly those: the filter is read once, against the starting state, even
  // when the write changes a field it reads or the filter looks at rows of this table
  const matched = captureMatchedIds(
    createCompileContext('', new Set(Object.keys(vars))),
    model.tableName,
    whereClause.text,
  );

  return {
    text: inTransaction([
      matched.statement,
      [`UPDATE ${matched.target}`, setText, `RETURN ${fields}`].filter((p) => p).join(' '),
    ]),
    vars,
  };
}

/**
 * Build WHERE clause from fields excluding the id field
 * Used for updateUnique when id is provided along with other fields
 */
function buildWhereClauseWithoutId(where: WhereClause, model: ModelMetadata, registry?: ModelRegistry): CompiledQuery {
  const idField = model.fields.find((f) => f.isId);
  if (!idField) {
    return transformDestructiveWhere(where, model, 'updateUnique', registry);
  }

  // Remove id field from where clause
  const whereWithoutId = { ...where };
  delete whereWithoutId[idField.name];

  // transformDestructiveWhere treats no remaining keys as "the id alone", and throws when keys remain
  // but compile to nothing
  return transformDestructiveWhere(whereWithoutId, model, 'updateUnique', registry);
}

/**
 * Check if a value is a full-replace object update ({ set: ... })
 */
function isSetWrapper(value: unknown): value is { set: unknown } {
  return typeof value === 'object' && value !== null && 'set' in value && Object.keys(value).length === 1;
}

/**
 * Check if a value is an array-of-objects update operation ({ push?, set?, updateWhere?, unset? })
 */
function isObjectArrayUpdateOps(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);

  return keys.some((k) => ['push', 'set', 'updateWhere', 'unset'].includes(k));
}

/**
 * Resolve the value for a tuple element from the update data object.
 * Checks named key first, then index key. Returns undefined if not provided.
 */
function resolveElementValue(element: TupleElementMetadata, data: Record<string, unknown>): unknown {
  if (element.name !== undefined && element.name in data) return data[element.name];
  const indexKey = String(element.index);
  if (indexKey in data) return data[indexKey];

  return undefined;
}

/**
 * Build SET clauses for a per-element tuple update using $this reconstruction.
 *
 * Phase 1: Builds a $this reconstruction array where unchanged elements use
 * `$this.field[N]` references and changed elements use bound variables.
 *
 * Phase 2: Generates dot-notation SET clauses for object element merges
 * and recursive calls for nested tuple per-element updates.
 */
function buildTupleUpdateClauses(
  ctx: FilterCompileContext,
  fieldPath: string,
  data: Record<string, unknown>,
  tupleInfo: TupleFieldMetadata,
  setParts: string[],
  setVars: Record<string, unknown>,
): void {
  const reconstructionParts: string[] = [];
  const objectMerges: { element: TupleElementMetadata; data: Record<string, unknown> }[] = [];
  const tupleUpdates: { element: TupleElementMetadata; data: Record<string, unknown> }[] = [];

  // Phase 1: Build $this reconstruction array
  for (const element of tupleInfo.elements) {
    const value = resolveElementValue(element, data);

    // Not provided — @updatedAt and @defaultAlways re-fire on every write, and the server's
    // DEFAULT ALWAYS cannot fire for a tuple element, so the refresh is written here.
    // Every other element keeps its stored value through a $this reference.
    if (value === undefined) {
      const refresh = tupleElementUpdateRefresh(element);
      if (refresh === undefined) {
        reconstructionParts.push(`$this.${fieldPath}[${element.index}]`);
      } else if (isInlineExpression(refresh)) {
        reconstructionParts.push(refresh.text);
      } else {
        const varName = `${fieldPath}_${element.index}`.replace(/[^a-zA-Z0-9_]/g, '_');
        const varBinding = ctx.bind(varName, 'set', refresh, element.type);
        reconstructionParts.push(varBinding.placeholder);
        Object.assign(setVars, varBinding.vars);
      }
      continue;
    }

    // NONE sentinel → clear the element
    // For @nullable (non-optional) elements, use NULL (NONE is invalid for `T | null` types)
    // For optional elements, use NONE (clears via option<T>)
    if (isNone(value)) {
      reconstructionParts.push(element.isNullable && !element.isOptional ? 'NULL' : 'NONE');
      continue;
    }

    // null → set element to NULL (for @nullable elements)
    if (value === null) {
      reconstructionParts.push('NULL');
      continue;
    }

    // Object element
    if (element.type === 'object' && element.objectInfo) {
      if (isSetWrapper(value)) {
        // Full replace: bind the entire object as a parameter
        const varName = `${fieldPath}_${element.index}`.replace(/[^a-zA-Z0-9_]/g, '_');
        const rendered = bindWithInlineExpressions(ctx, varName, 'set', (value as { set: unknown }).set, element.type);
        reconstructionParts.push(rendered.text);
        Object.assign(setVars, rendered.vars);
      } else {
        // Partial merge: use $this to preserve, then dot-notation in phase 2
        reconstructionParts.push(`$this.${fieldPath}[${element.index}]`);
        objectMerges.push({ element, data: value as Record<string, unknown> });
      }
      continue;
    }

    // Nested tuple element — array = full replace, object = per-element update (no wrapper needed)
    if (element.type === 'tuple' && element.tupleInfo) {
      if (Array.isArray(value)) {
        // Full replace (array form): bind the entire tuple as a parameter
        const varName = `${fieldPath}_${element.index}`.replace(/[^a-zA-Z0-9_]/g, '_');
        const rendered = bindWithInlineExpressions(ctx, varName, 'set', value, element.type);
        reconstructionParts.push(rendered.text);
        Object.assign(setVars, rendered.vars);
      } else {
        // Per-element update (object form): use $this to preserve, then recurse in phase 2
        reconstructionParts.push(`$this.${fieldPath}[${element.index}]`);
        tupleUpdates.push({ element, data: value as Record<string, unknown> });
      }
      continue;
    }

    // Primitive element: bind as parameter
    const varName = `${fieldPath}_${element.index}`.replace(/[^a-zA-Z0-9_]/g, '_');
    const varBinding = ctx.bind(varName, 'set', value, element.type);
    reconstructionParts.push(varBinding.placeholder);
    Object.assign(setVars, varBinding.vars);
  }

  // Emit $this reconstruction SET clause
  setParts.push(`${fieldPath} = [${reconstructionParts.join(', ')}]`);

  // Phase 2: Object merges at sub-paths (dot-notation)
  for (const { element, data: mergeData } of objectMerges) {
    buildObjectMergeClauses(ctx, `${fieldPath}[${element.index}]`, mergeData, element.objectInfo!, setParts, setVars);
  }

  // Phase 2: Nested tuple per-element updates (recursive)
  for (const { element, data: updateData } of tupleUpdates) {
    buildTupleUpdateClauses(ctx, `${fieldPath}[${element.index}]`, updateData, element.tupleInfo!, setParts, setVars);
  }
}

/**
 * Build SET clauses for a partial object merge (dot notation).
 * { city: 'NYC', street: '123 Main' } → ['address.city = $p0', 'address.street = $p1']
 *
 * Also injects NONE for @updatedAt sub-fields not in the user data,
 * so DEFAULT ALWAYS time::now() re-fires on the sub-field.
 */
function buildObjectMergeClauses(
  ctx: FilterCompileContext,
  fieldPath: string,
  data: Record<string, unknown>,
  objectInfo: ObjectFieldMetadata,
  setParts: string[],
  setVars: Record<string, unknown>,
  isFlexible?: boolean,
): void {
  for (const [subKey, subValue] of Object.entries(data)) {
    if (subValue === undefined) continue;

    const declared = objectInfo.fields.some((f) => f.name === subKey);
    const keyText = declared ? subKey : quoteSubKey(subKey);

    // NONE sentinel in sub-field (from unset merge) → emit dot-notation NONE
    if (isNone(subValue)) {
      setParts.push(`${fieldPath}.${keyText} = NONE`);
      continue;
    }

    // null in sub-field — check @nullable
    if (subValue === null) {
      const subField = objectInfo.fields.find((f) => f.name === subKey);
      if (subField?.isNullable) {
        const subPath = `${fieldPath}.${subKey}`;
        const varBinding = ctx.bind(subPath.replace(/\./g, '_'), 'set', null, subField.type);
        setParts.push(`${subPath} = ${varBinding.placeholder}`);
        Object.assign(setVars, varBinding.vars);
      } else {
        setParts.push(`${fieldPath}.${keyText} = NONE`);
      }
      continue;
    }

    const subField = objectInfo.fields.find((f) => f.name === subKey);

    // Unknown field — pass through for @flexible objects
    if (!subField) {
      if (!isFlexible) continue;

      const subPath = `${fieldPath}.${keyText}`;
      const varBinding = ctx.bind(subPath.replace(/\./g, '_'), 'set', subValue, 'string');
      setParts.push(`${subPath} = ${varBinding.placeholder}`);
      Object.assign(setVars, varBinding.vars);
      continue;
    }

    const subPath = `${fieldPath}.${subKey}`;

    // Array of objects (a self-referencing object's own list among them): written whole, never merged by index
    if (subField.type === 'object' && subField.isArray) {
      buildObjectArrayClauses(ctx, subPath, subValue, setParts, setVars);
      continue;
    }

    // Nested object: recursive merge
    if (
      subField.type === 'object' &&
      subField.objectInfo &&
      typeof subValue === 'object' &&
      subValue !== null &&
      !isSetWrapper(subValue)
    ) {
      buildObjectMergeClauses(
        ctx,
        subPath,
        subValue as Record<string, unknown>,
        subField.objectInfo,
        setParts,
        setVars,
        subField.isFlexible,
      );
      continue;
    }

    // Tuple field within object merge — array = full replace, object = per-element update
    if (subField.type === 'tuple' && subField.tupleInfo) {
      if (!Array.isArray(subValue) && typeof subValue === 'object' && subValue !== null) {
        // Object form = per-element update
        buildTupleUpdateClauses(
          ctx,
          subPath,
          subValue as Record<string, unknown>,
          subField.tupleInfo,
          setParts,
          setVars,
        );
      } else {
        // Array form = full tuple replace via dot-notation
        const rendered = bindWithInlineExpressions(
          ctx,
          subPath.replace(/[.[\]]/g, '_'),
          'set',
          subValue,
          subField.type,
        );
        setParts.push(`${subPath} = ${rendered.text}`);
        Object.assign(setVars, rendered.vars);
      }
      continue;
    }

    // Primitive or full replace
    const varBinding = ctx.bind(subPath.replace(/\./g, '_'), 'set', subValue, subField.type);
    setParts.push(`${subPath} = ${varBinding.placeholder}`);
    Object.assign(setVars, varBinding.vars);
  }

  // Inject NONE for @updatedAt and @defaultAlways sub-fields not provided by user
  // This triggers DEFAULT ALWAYS on the sub-field
  for (const subField of objectInfo.fields) {
    if (subField.timestampDecorator === 'updatedAt' && !(subField.name in data)) {
      setParts.push(`${fieldPath}.${subField.name} = NONE`);
    }
    if (subField.defaultAlwaysValue !== undefined && !(subField.name in data)) {
      setParts.push(`${fieldPath}.${subField.name} = NONE`);
    }
  }
}

/**
 * Build SET clauses for an array of objects: direct assignment, or { push, set }.
 * `path` may be dotted (a sub-key of an object); variable names are derived from it without the dots.
 */
function buildObjectArrayClauses(
  ctx: FilterCompileContext,
  path: string,
  value: unknown,
  setParts: string[],
  setVars: Record<string, unknown>,
): void {
  const varName = path.replace(/[^a-zA-Z0-9_]/g, '_');

  // Direct array assignment
  if (Array.isArray(value)) {
    const varBinding = ctx.bind(varName, 'set', value, 'object');
    setParts.push(`${path} = ${varBinding.placeholder}`);
    Object.assign(setVars, varBinding.vars);

    return;
  }

  // Object array operations
  if (!isObjectArrayUpdateOps(value)) return;
  const ops = value as Record<string, unknown>;

  if (ops.push !== undefined) {
    const pushValue = Array.isArray(ops.push) ? ops.push : [ops.push];
    for (const item of pushValue) {
      const varBinding = ctx.bind(varName, 'push', item, 'object');
      setParts.push(`${path} += ${varBinding.placeholder}`);
      Object.assign(setVars, varBinding.vars);
    }
  }

  if (ops.set !== undefined) {
    const varBinding = ctx.bind(varName, 'set', ops.set, 'object');
    setParts.push(`${path} = ${varBinding.placeholder}`);
    Object.assign(setVars, varBinding.vars);
  }

  // updateWhere and unset are refused by the data validator before this builder runs
}

/**
 * Build SET clauses for object field updates.
 * Handles: merge (partial), { set: ... } (full replace), null (clear), and array ops.
 */
function buildObjectUpdateClauses(
  ctx: FilterCompileContext,
  field: string,
  value: unknown,
  fieldMetadata: FieldMetadata,
  setParts: string[],
  setVars: Record<string, unknown>,
): void {
  if (!fieldMetadata.objectInfo) return;

  // NONE sentinel or null → clear optional object (use NONE since object fields can't be @nullable)
  if (isNone(value) || value === null) {
    setParts.push(`${field} = NONE`);

    return;
  }

  if (fieldMetadata.isArray) {
    buildObjectArrayClauses(ctx, field, value, setParts, setVars);

    return;
  }

  // Single object: { set: ... } → full replace
  if (isSetWrapper(value)) {
    const rendered = bindWithInlineExpressions(ctx, field, 'set', (value as { set: unknown }).set, 'object');
    setParts.push(`${field} = ${rendered.text}`);
    Object.assign(setVars, rendered.vars);

    return;
  }

  // Single object: partial merge (dot notation)
  if (typeof value === 'object' && value !== null) {
    buildObjectMergeClauses(
      ctx,
      field,
      value as Record<string, unknown>,
      fieldMetadata.objectInfo,
      setParts,
      setVars,
      fieldMetadata.isFlexible,
    );
  }
}

/**
 * Build SET clause for updateUnique — thin wrapper around buildUpdateSetClauses
 * that merges unset into data first.
 */
function buildSetClause(
  data: Record<string, unknown>,
  model: ModelMetadata,
  unset?: Record<string, unknown>,
): { setParts: string[]; setVars: Record<string, unknown> } {
  const ctx = createCompileContext();
  const mergedData = unset ? mergeUnsetIntoData(data, unset) : data;

  return buildUpdateSetClauses(ctx, mergedData, model);
}

/**
 * Build RETURN clause for updateUnique based on return option and select/include
 */
function buildUpdateUniqueReturnClause(
  returnOption: UpdateUniqueReturn,
  select: SelectClause | undefined,
  include: IncludeClause | undefined,
  model: ModelMetadata,
  registry?: ModelRegistry,
  ctx?: FilterCompileContext,
): string {
  // 'before' - return pre-update state (select and include read before the write)
  if (returnOption === 'before') {
    return 'RETURN BEFORE';
  }

  // true - no explicit return, we'll check if result is NONE
  if (returnOption === true) {
    return '';
  }

  // Default / 'after' - return updated record with select/include support
  const fields = select ? buildSelectFields(select, model) : '*';
  const fieldsWithIncludes = include ? combineSelectWithIncludes(fields, include, model, registry, ctx) : fields;

  return `RETURN ${fieldsWithIncludes}`;
}

/**
 * Build UPDATE unique query for a single record by unique field
 *
 * Query patterns:
 * - { id: '123' } → UPDATE ONLY table:123 SET ...
 * - { id: '123', email: 'x@y.com' } → UPDATE ONLY table:123 SET ... WHERE email = $email
 * - { email: 'x@y.com' } → UPDATE table SET ... WHERE email = $email
 * - { email: 'x', isActive: true } → UPDATE table SET ... WHERE email = $email AND isActive = $isActive
 */
export function buildUpdateUniqueQuery(
  model: ModelMetadata,
  where: WhereClause,
  data: Record<string, unknown>,
  returnOption: UpdateUniqueReturn,
  select?: SelectClause,
  include?: IncludeClause,
  registry?: ModelRegistry,
  unset?: Record<string, unknown>,
): CompiledQuery {
  const { hasId, id, expandedWhere } = getRecordIdFromWhere(where, model, 'updateUnique');

  // Build SET clause
  const { setParts, setVars } = buildSetClause(data, model, unset);

  // Build RETURN clause
  const includeCtx = createCompileContext('inc_');
  const snapshot = needsBeforeSnapshot(returnOption, select, include);
  const returnClause = snapshot
    ? 'RETURN NONE'
    : buildUpdateUniqueReturnClause(returnOption, select, include, model, registry, includeCtx);

  // The row is read through the projection first; the write itself returns nothing
  const wrap = (from: string, whereText: string, statement: string): CompiledQuery['text'] =>
    snapshot
      ? [
          'BEGIN TRANSACTION;',
          buildBeforeSnapshot(from, whereText, select, model, include, registry, includeCtx),
          `${statement};`,
          'COMMIT TRANSACTION;',
          'RETURN $before;',
        ].join('\n')
      : statement;

  if (hasId) {
    // ID-based: UPDATE ONLY table:id SET ... [WHERE other fields] [RETURN ...]
    const recordId = transformOrValidateRecordId(model.tableName, id!);
    const whereClause = buildWhereClauseWithoutId(expandedWhere, model, registry);
    // Bound, never interpolated: the id part is caller text and the driver's escaper leaves a backslash alone
    const idBinding = createCompileContext('rid_').bind('record', 'id', recordId, 'string');

    const parts = [
      `UPDATE ONLY ${idBinding.placeholder}`,
      setParts.length > 0 ? `SET ${setParts.join(', ')}` : '',
      whereClause.text,
      returnClause,
    ].filter((p) => p);

    return {
      text: wrap(idBinding.placeholder, whereClause.text, parts.join(' ')),
      vars: { ...setVars, ...whereClause.vars, ...idBinding.vars, ...includeCtx.getCollected() },
    };
  }

  // Unique field (no id): UPDATE table SET ... WHERE all fields [RETURN ...]
  const whereClause = transformDestructiveWhere(expandedWhere, model, 'updateUnique', registry);

  const parts = [
    `UPDATE ${model.tableName}`,
    setParts.length > 0 ? `SET ${setParts.join(', ')}` : '',
    whereClause.text,
    returnClause,
  ].filter((p) => p);

  return {
    text: wrap(model.tableName, whereClause.text, parts.join(' ')),
    vars: { ...setVars, ...whereClause.vars, ...includeCtx.getCollected() },
  };
}
