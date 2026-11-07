/**
 * SELECT query builder
 */

import { CerialValidationError } from '../../errors';
import { getUniqueFields } from '../../parser/model-metadata';
import type {
  FieldMetadata,
  FindOptions,
  FindUniqueOptions,
  ModelMetadata,
  ModelRegistry,
  ObjectFieldMetadata,
  OrderByClause,
  SelectClause,
  TupleElementMetadata,
  TupleFieldMetadata,
  WhereClause,
} from '../../types';
import { quoteSubKey } from '../../utils/string-utils';
import { compileFragment, type SqlFragment } from '../compile/sql-fragment';
import type { CompiledQuery } from '../compile/types';
import { createCompileContext, type FilterCompileContext } from '../compile/var-allocator';
import { expandCompositeKey, findCompositeUniqueKey } from '../filters/composite-key';
import { isOperatorObject } from '../filters/condition-builder';
import { transformWhereClause } from '../filters/transformer';
import { transformOrValidateRecordId } from '../transformers';
import { combineSelectWithIncludes, type IncludeClause } from './relation-builder';

export { expandCompositeKey, findCompositeUniqueKey };

/** Computed projections: each key becomes a result key holding the fragment's value */
export type ComputeClause = Record<string, SqlFragment>;

/** Extended find options with include support */
export interface FindOptionsWithInclude extends FindOptions {
  include?: IncludeClause;
  compute?: ComputeClause;
}

/** Extended find unique options with include support */
export interface FindUniqueOptionsWithInclude extends FindUniqueOptions {
  include?: IncludeClause;
  compute?: ComputeClause;
}

/**
 * ``expr AS `key` `` for each compute key. The alias is always backtick-quoted, so a keyword key stays a
 * name; validateCompute has already limited keys to plain identifiers. Values bind through `ctx`, the
 * context include uses, so their names cannot collide with it.
 */
function buildComputeFields(compute: ComputeClause, ctx: FilterCompileContext): string[] {
  return Object.entries(compute).map(([key, fragment]) => {
    const compiled = compileFragment(fragment, ctx);
    ctx.collect(compiled.vars);

    return `${compiled.text} AS \`${key}\``;
  });
}

/**
 * Build destructuring select for an object field.
 * { city: true, zipCode: true } → 'address.{ city, zipCode }'
 * { lat: true, label: { city: true } } → 'location.{ lat, label.{ city } }'
 */
function buildObjectSelect(fieldPath: string, selectValue: Record<string, unknown>): string {
  const subFields: string[] = [];

  for (const [key, val] of Object.entries(selectValue)) {
    if (!val) continue;

    if (val === true) {
      subFields.push(quoteSubKey(key));
    } else if (typeof val === 'object' && val !== null) {
      // Nested object sub-select
      const inner = buildObjectSelectInner(quoteSubKey(key), val as Record<string, unknown>);
      if (inner) subFields.push(inner);
    }
  }

  if (!subFields.length) return fieldPath;

  return `${fieldPath}.{ ${subFields.join(', ')} }`;
}

/** Build inner destructuring (no outer field path prefix) */
function buildObjectSelectInner(fieldName: string, selectValue: Record<string, unknown>): string {
  const subFields: string[] = [];

  for (const [key, val] of Object.entries(selectValue)) {
    if (!val) continue;

    if (val === true) {
      subFields.push(quoteSubKey(key));
    } else if (typeof val === 'object' && val !== null) {
      const inner = buildObjectSelectInner(quoteSubKey(key), val as Record<string, unknown>);
      if (inner) subFields.push(inner);
    }
  }

  if (!subFields.length) return fieldName;

  return `${fieldName}.{ ${subFields.join(', ')} }`;
}

/**
 * Resolve a tuple element by its select key (index or name).
 * The select type allows both numeric index keys and named keys.
 */
export function resolveElementBySelectKey(
  key: string,
  elements: TupleElementMetadata[],
): TupleElementMetadata | undefined {
  // Try numeric index first
  const numKey = Number(key);
  if (!Number.isNaN(numKey)) return elements.find((e) => e.index === numKey);

  // Try named key
  return elements.find((e) => e.name === key);
}

/**
 * Build explicit object construction for an object within a tuple.
 * Unlike `.{ ... }` destructuring, this uses `{ key: path.key }` syntax
 * which works correctly when embedded inside tuple array reconstruction.
 *
 * Example: buildObjectSelectExplicit('loc[1]', { city: true, zip: true }, objectInfo)
 * → '{ city: loc[1].city, zip: loc[1].zip }'
 */
function buildObjectSelectExplicit(
  fieldPath: string,
  selectValue: Record<string, unknown>,
  objectInfo: ObjectFieldMetadata,
): string {
  const entries: string[] = [];

  for (const [key, val] of Object.entries(selectValue)) {
    if (!val) continue;

    const subField = objectInfo.fields.find((f) => f.name === key);
    if (!subField) continue;

    const subPath = `${fieldPath}.${key}`;

    if (val === true) {
      entries.push(`${key}: ${subPath}`);
    } else if (typeof val === 'object' && val !== null) {
      // Nested object or tuple within object
      if (subField.type === 'tuple' && subField.tupleInfo) {
        const inner = buildTupleSelectInner(subPath, val as Record<string, unknown>, subField.tupleInfo);
        entries.push(`${key}: ${inner}`);
      } else if (subField.type === 'object' && subField.objectInfo) {
        const inner = buildObjectSelectExplicit(subPath, val as Record<string, unknown>, subField.objectInfo);
        entries.push(`${key}: ${inner}`);
      }
    }
  }

  if (!entries.length) return fieldPath;

  return `{ ${entries.join(', ')} }`;
}

/**
 * Build tuple select inner expression (no alias) — returns `[expr0, expr1, ...]`.
 * Each element is either `$this.path[i]` (full element) or a narrowed sub-select.
 * Object elements use explicit object construction. Nested tuples recurse.
 */
function buildTupleSelectInner(
  fieldPath: string,
  selectValue: Record<string, unknown>,
  tupleInfo: TupleFieldMetadata,
): string {
  // Build a map of element index → select value from the user's select object
  const selectMap = new Map<number, unknown>();
  for (const [key, val] of Object.entries(selectValue)) {
    if (!val) continue;
    const element = resolveElementBySelectKey(key, tupleInfo.elements);
    if (element) selectMap.set(element.index, val);
  }

  const elementExprs: string[] = [];

  for (const element of tupleInfo.elements) {
    const elemPath = `${fieldPath}[${element.index}]`;
    const selectVal = selectMap.get(element.index);

    if (!selectVal || selectVal === true) {
      // No select for this element or `true` → return full element
      elementExprs.push(elemPath);
    } else if (typeof selectVal === 'object' && selectVal !== null) {
      // Sub-select: object or nested tuple
      if (element.type === 'object' && element.objectInfo) {
        elementExprs.push(
          buildObjectSelectExplicit(elemPath, selectVal as Record<string, unknown>, element.objectInfo),
        );
      } else if (element.type === 'tuple' && element.tupleInfo) {
        elementExprs.push(buildTupleSelectInner(elemPath, selectVal as Record<string, unknown>, element.tupleInfo));
      } else {
        // Primitive with object select value — shouldn't happen, fall back to full element
        elementExprs.push(elemPath);
      }
    } else {
      elementExprs.push(elemPath);
    }
  }

  return `[${elementExprs.join(', ')}]`;
}

/**
 * Build top-level tuple select expression with alias.
 * Reconstructs the tuple array with sub-field narrowing on object/tuple elements.
 *
 * Example: buildTupleSelect('loc', { 1: { city: true } }, tupleInfo)
 * → '[loc[0], { city: loc[1].city }] as loc'
 */
export function buildTupleSelect(
  fieldPath: string,
  selectValue: Record<string, unknown>,
  tupleInfo: TupleFieldMetadata,
): string {
  const inner = buildTupleSelectInner(fieldPath, selectValue, tupleInfo);

  return `${inner} as ${fieldPath}`;
}

/** Build SELECT field list */
export function buildSelectFields(
  select: SelectClause | undefined,
  model: ModelMetadata,
  include?: IncludeClause,
  registry?: ModelRegistry,
  ctx?: FilterCompileContext,
  compute?: ComputeClause,
): string {
  let baseSelect: string;

  if (!select) {
    baseSelect = '*';
  } else {
    const fields = Object.entries(select)
      .filter(([_, include]) => include)
      .map(([field, selectValue]) => {
        if (typeof selectValue === 'object' && selectValue !== null) {
          // Check if this is a tuple field (needs array reconstruction, not destructuring)
          const fieldMeta = model.fields.find((f) => f.name === field);
          if (fieldMeta?.type === 'tuple' && fieldMeta.tupleInfo) {
            return buildTupleSelect(field, selectValue as Record<string, unknown>, fieldMeta.tupleInfo);
          }

          // Object sub-field select: { address: { city: true } }
          return buildObjectSelect(field, selectValue as Record<string, unknown>);
        }
        // Boolean true: select entire field
        return field;
      });

    baseSelect = fields.length === 0 ? '*' : fields.join(', ');
  }

  if (compute) {
    if (!ctx) {
      throw new CerialValidationError('compute needs a compile context, and none was supplied', {
        model: model.name,
        field: 'compute',
      });
    }
    baseSelect = [baseSelect, ...buildComputeFields(compute, ctx)].join(', ');
  }

  // Add relation fields from include
  if (include) {
    return combineSelectWithIncludes(baseSelect, include, model, registry, ctx);
  }

  return baseSelect;
}

/**
 * `return: 'before'` with a select or include. RETURN BEFORE hands back every stored field and cannot
 * resolve a relation, so the row is read through the caller's projection ahead of the write instead.
 * Runs before the write, so relations resolve as they stood then.
 */
export function needsBeforeSnapshot(
  returnOption: unknown,
  select: SelectClause | undefined,
  include: IncludeClause | undefined,
): boolean {
  return returnOption === 'before' && !!(select || include);
}

/** `LET $before = (...)` over `from` (a table or record id) and an already-built WHERE clause. */
export function buildBeforeSnapshot(
  from: string,
  whereText: string,
  select: SelectClause | undefined,
  model: ModelMetadata,
  include: IncludeClause | undefined,
  registry?: ModelRegistry,
  ctx?: FilterCompileContext,
): string {
  const fields = buildSelectFields(select, model, include, registry, ctx);

  return `LET $before = (${['SELECT', fields, 'FROM', from, whereText].filter(Boolean).join(' ')});`;
}

/** Alias prefix for projected relation sort keys; OMITted again by the outer query. */
const ORDER_ALIAS_PREFIX = '__cerial_ord_';

/** An ORDER BY plan: the clause plus the projections it needs on the inner query. */
export interface OrderByPlan {
  clause: string;
  /** `path AS alias` entries, one per relation sort key */
  projections: string[];
  /** Alias names, to OMIT from the outer query */
  aliases: string[];
}

interface OrderByContext {
  registry?: ModelRegistry;
  /** Compute keys, sortable at the top level through their alias */
  computeKeys?: readonly string[];
  parts: string[];
  projections: string[];
  aliases: string[];
}

/**
 * Recursively build order by parts with dot notation.
 * `viaRelation` is true once the path crosses a record link: SurrealDB does not sort on
 * `link.field` directly, so those keys are projected to an alias and ordered by the alias.
 */
function buildOrderByParts(
  prefix: string,
  orderBy: Record<string, unknown>,
  fields: FieldMetadata[] | undefined,
  viaRelation: boolean,
  ctx: OrderByContext,
): void {
  for (const [key, directionOrNested] of Object.entries(orderBy)) {
    const fieldMeta = fields?.find((f) => f.name === key);

    // The alias is quoted because an expression cannot sit in ORDER BY
    if (!prefix && !fieldMeta && ctx.computeKeys?.includes(key) && typeof directionOrNested === 'string') {
      ctx.parts.push(`\`${key}\` ${orderDirection(directionOrNested, key)}`);
      continue;
    }

    if (fieldMeta?.type === 'relation' && fieldMeta.relationInfo) {
      const { fieldRef, targetModel, isReverse } = fieldMeta.relationInfo;
      const target = ctx.registry?.[targetModel];

      if (isReverse || !fieldRef || !target)
        throw new CerialValidationError(`Cannot order by relation '${key}': no foreign key or target model available`, {
          field: key,
        });
      if (typeof directionOrNested !== 'object' || directionOrNested === null) continue;

      const path = prefix ? `${prefix}.${quoteSubKey(fieldRef)}` : quoteSubKey(fieldRef);
      buildOrderByParts(path, directionOrNested as Record<string, unknown>, target.fields, true, ctx);
      continue;
    }

    const path = prefix ? `${prefix}.${quoteSubKey(key)}` : quoteSubKey(key);
    const nextFields = fieldMeta?.type === 'object' ? fieldMeta.objectInfo?.fields : undefined;

    if (typeof directionOrNested === 'string') {
      const direction = orderDirection(directionOrNested, key);

      if (viaRelation) {
        const alias = `${ORDER_ALIAS_PREFIX}${ctx.aliases.length}`;
        ctx.projections.push(`${path} AS ${alias}`);
        ctx.aliases.push(alias);
        ctx.parts.push(`${alias} ${direction}`);
      } else {
        ctx.parts.push(`${path} ${direction}`);
      }
    } else if (typeof directionOrNested === 'object' && directionOrNested !== null) {
      // Recursive: nested object ordering
      buildOrderByParts(path, directionOrNested as Record<string, unknown>, nextFields, viaRelation, ctx);
    }
  }
}

/**
 * Plan an ORDER BY. Relation keys need `model` and `registry` to resolve the foreign key and the
 * target's fields; own and object keys do not.
 */
export function buildOrderByPlan(
  orderBy: OrderByClause | undefined,
  model?: ModelMetadata,
  registry?: ModelRegistry,
  computeKeys?: readonly string[],
): OrderByPlan {
  const ctx: OrderByContext = { registry, computeKeys, parts: [], projections: [], aliases: [] };
  if (orderBy) buildOrderByParts('', orderBy as Record<string, unknown>, model?.fields, false, ctx);

  return {
    clause: ctx.parts.length ? `ORDER BY ${ctx.parts.join(', ')}` : '',
    projections: ctx.projections,
    aliases: ctx.aliases,
  };
}

/** Build ORDER BY clause - supports nested object ordering like { address: { city: 'asc' } } */
export function buildOrderBy(
  orderBy: OrderByClause | undefined,
  model?: ModelMetadata,
  registry?: ModelRegistry,
): string {
  return buildOrderByPlan(orderBy, model, registry).clause;
}

/** Paging is spliced as text, so only a safe non-negative integer may reach it */
function assertPage(name: 'limit' | 'offset', value: unknown): void {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return;

  throw new CerialValidationError(`${name} must be a non-negative integer, got ${String(value)}`, { field: name });
}

/** Only these two words are ever emitted into ORDER BY */
function orderDirection(value: string, key: string): 'ASC' | 'DESC' {
  const direction = value.toUpperCase();
  if (direction === 'ASC' || direction === 'DESC') return direction;

  throw new CerialValidationError(`orderBy.${key} must be 'asc' or 'desc', got ${JSON.stringify(value)}`, {
    field: key,
  });
}

/** Build LIMIT clause */
export function buildLimit(limit: number | undefined): string {
  if (limit === undefined) return '';
  assertPage('limit', limit);

  return `LIMIT ${limit}`;
}

/** Build OFFSET/START clause */
export function buildOffset(offset: number | undefined): string {
  if (offset === undefined) return '';
  assertPage('offset', offset);

  return `START ${offset}`;
}

/** Build a complete SELECT query */
export function buildSelectQuery(
  model: ModelMetadata,
  options: FindOptionsWithInclude,
  fromSingle: boolean = false,
  registry?: ModelRegistry,
): CompiledQuery {
  const { where, select, orderBy, limit, offset, include, compute } = options;

  const includeCtx = createCompileContext('inc_');
  const fields = buildSelectFields(select, model, include, registry, includeCtx, compute);
  const whereClause = transformWhereClause(where, model, registry);
  const vars = { ...whereClause.vars, ...includeCtx.getCollected() };
  const orderPlan = buildOrderByPlan(orderBy, model, registry, compute && Object.keys(compute));
  const limitClause = buildLimit(limit);
  const offsetClause = buildOffset(offset);
  const source = fromSingle ? 'FROM ONLY' : 'FROM';

  // Relation sort keys are projected to aliases on an inner query, which also owns WHERE, ORDER BY,
  // LIMIT and START so paging happens after sorting. The outer query drops the aliases again.
  const selectList = orderPlan.projections.length ? `${fields}, ${orderPlan.projections.join(', ')}` : fields;
  const parts = [
    `SELECT ${selectList} ${orderPlan.projections.length ? 'FROM' : source} ${model.tableName}`,
    whereClause.text,
    orderPlan.clause,
    limitClause,
    offsetClause,
  ].filter((p) => p);

  if (!orderPlan.projections.length) return { text: parts.join(' '), vars };

  return {
    text: `SELECT * OMIT ${orderPlan.aliases.join(', ')} ${source} (${parts.join(' ')})`,
    vars,
  };
}

/** Build a findOne SELECT query (LIMIT 1) */
export function buildFindOneQuery(
  model: ModelMetadata,
  options: FindOptionsWithInclude,
  registry?: ModelRegistry,
): CompiledQuery {
  return buildSelectQuery(model, { ...options, limit: 1 }, true, registry);
}

/** Build a findMany SELECT query */
export function buildFindManyQuery(
  model: ModelMetadata,
  options: FindOptionsWithInclude,
  registry?: ModelRegistry,
): CompiledQuery {
  return buildSelectQuery(model, options, false, registry);
}

/** Build a SELECT count() ... GROUP ALL query */
export function buildCountQuery(
  model: ModelMetadata,
  where: WhereClause | undefined,
  registry?: ModelRegistry,
): CompiledQuery {
  const whereClause = transformWhereClause(where, model, registry);

  const parts = [`SELECT count() FROM ${model.tableName}`, whereClause.text, 'GROUP ALL'].filter((p) => p);

  return {
    text: parts.join(' '),
    vars: whereClause.vars,
  };
}

/**
 * Find an object @unique key in the where clause.
 * Detects when a where clause provides an object field value containing a @unique subfield.
 *
 * Example: where = { address: { zip: '10001' } }
 * If Address.zip is @unique, returns { fieldName: 'address', dotPaths: { 'address.zip': '10001' } }
 */
export function findObjectUniqueKey(
  where: WhereClause,
  model: ModelMetadata,
): { fieldName: string; dotPaths: Record<string, unknown> } | null {
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined || value === null) continue;
    if (typeof value !== 'object' || Array.isArray(value)) continue;

    const field = model.fields.find((f) => f.name === key);
    if (!field || field.type !== 'object' || !field.objectInfo) continue;
    if (field.isArray) continue; // Array objects can't have @unique

    // Walk the value structure to find unique subfields
    const dotPaths = extractObjectUniquePaths(key, value as Record<string, unknown>, field.objectInfo.fields);
    if (Object.keys(dotPaths).length) {
      return { fieldName: key, dotPaths };
    }
  }

  return null;
}

/**
 * Extract dot-notation paths for @unique subfields from a nested object value.
 * Recursively walks the value to match against unique fields in the object metadata.
 */
function extractObjectUniquePaths(
  prefix: string,
  value: Record<string, unknown>,
  fields: FieldMetadata[],
): Record<string, unknown> {
  const paths: Record<string, unknown> = {};

  for (const [subKey, subValue] of Object.entries(value)) {
    const subField = fields.find((f) => f.name === subKey);
    if (!subField) continue;

    const dotPath = `${prefix}.${subKey}`;

    if (subField.isUnique) {
      paths[dotPath] = subValue;
    } else if (subField.type === 'object' && subField.objectInfo && typeof subValue === 'object' && subValue !== null) {
      // Recurse into nested objects
      Object.assign(
        paths,
        extractObjectUniquePaths(dotPath, subValue as Record<string, unknown>, subField.objectInfo.fields),
      );
    }
  }

  return paths;
}

/**
 * Expand object @unique keys in a where clause into dot-notation field conditions.
 * Removes the object field from the where clause and injects dot-notation paths.
 *
 * Example: { address: { zip: '10001' }, isActive: true }
 * Becomes: { 'address.zip': '10001', isActive: true }
 */
export function expandObjectUniqueKey(where: WhereClause, model: ModelMetadata): WhereClause {
  const objectKey = findObjectUniqueKey(where, model);
  if (!objectKey) return where;

  const expanded: WhereClause = { ...where };
  delete expanded[objectKey.fieldName];

  // Inject dot-notation paths
  for (const [dotPath, value] of Object.entries(objectKey.dotPaths)) {
    expanded[dotPath] = value;
  }

  return expanded;
}

/** A unique filter identifies one record, so it takes a plain value; an operator object would match many. */
function assertPlainUniqueValue(methodName: string, model: ModelMetadata, path: string, value: unknown): void {
  if (!isOperatorObject(value)) return;

  throw new CerialValidationError(
    `${methodName} on ${model.name}: unique key '${path}' must be a plain value, not a filter object ` +
      `(${Object.keys(value).join(', ')}). A unique filter takes plain values only; filter with operators through findMany, updateMany or deleteMany.`,
    { model: model.name, operation: methodName, field: path },
  );
}

/**
 * A unique key present with the value undefined (`email: req.body.email` with the field absent) is skipped by the
 * condition builder, so the call would run on whatever the rest of the where matches. It is a lost value, not an
 * absent key, and is refused wherever a unique key picks the row.
 */
export function assertNoUndefinedUniqueKey(where: WhereClause, model: ModelMetadata, operation: string): void {
  for (const f of model.fields) {
    if (!f.isId && !f.isUnique) continue;
    if (!(f.name in where) || where[f.name] !== undefined) continue;

    throw new CerialValidationError(
      `${operation} on ${model.name}: where.${f.name} is undefined; pass a value or leave the key out`,
      { model: model.name, operation, field: f.name },
    );
  }
}

/**
 * Validate at least one unique field or composite unique key is present in where clause
 * @param where - The where clause to validate
 * @param model - The model metadata
 * @param methodName - The method name for error messages (default: 'findUnique')
 * @throws Error if no unique field is present
 */
export function validateUniqueField(where: WhereClause, model: ModelMetadata, methodName = 'findUnique'): void {
  assertNoUndefinedUniqueKey(where, model, methodName);

  // Check for composite unique key first
  if (findCompositeUniqueKey(where, model)) return;

  // Check for object @unique key. Its parts are checked here because an undefined one is skipped by the
  // condition builder, which would leave a unique-key DELETE or UPDATE with no condition at all.
  const objectKey = findObjectUniqueKey(where, model);
  if (objectKey) {
    for (const [path, value] of Object.entries(objectKey.dotPaths)) {
      if (value === undefined)
        throw new CerialValidationError(`${methodName} on ${model.name}: unique key '${path}' has no value`, {
          model: model.name,
          operation: methodName,
          field: path,
        });
      assertPlainUniqueValue(methodName, model, path, value);
    }

    return;
  }

  const idField = model.fields.find((f) => f.isId);
  const uniqueFields = getUniqueFields(model);
  const allUniqueFields = idField ? [idField, ...uniqueFields.filter((f) => !f.isId)] : uniqueFields;

  // Find which unique fields are present (as direct values, not operators)
  const providedFields = allUniqueFields.filter((f) => !!where[f.name]);

  for (const field of providedFields) assertPlainUniqueValue(methodName, model, field.name, where[field.name]);

  // Validation: at least one unique field required
  if (!providedFields.length) {
    const fieldNames = allUniqueFields.map((f) => f.name).join(', ');
    const compositeNames = (model.compositeDirectives ?? []).filter((d) => d.kind === 'unique').map((d) => d.name);
    const compositeHint = compositeNames.length
      ? ` Available composite unique keys: ${compositeNames.join(', ')}.`
      : '';
    throw new CerialValidationError(
      `At least one unique field must be provided in where clause for ${methodName}. ` +
        `Available unique fields: ${fieldNames}.${compositeHint}`,
      { model: model.name, operation: methodName },
    );
  }
}

/** @deprecated Use validateUniqueField instead */
function hasUniqueField(where: WhereClause, model: ModelMetadata): void {
  validateUniqueField(where, model, 'findUnique');
}

/** Build findUnique query when ID is provided (uses FROM ONLY table:id) */
function buildFindUniqueByIdQuery(
  model: ModelMetadata,
  where: WhereClause,
  select: SelectClause | undefined,
  idField: FieldMetadata,
  include?: IncludeClause,
  registry?: ModelRegistry,
  compute?: ComputeClause,
): CompiledQuery {
  const idValue = where[idField.name] as string;
  const recordId = transformOrValidateRecordId(model.tableName, idValue);

  // Remove ONLY id from where clause (keep other unique fields + non-unique fields)
  const whereWithoutId = { ...where };
  delete whereWithoutId[idField.name];

  const includeCtx = createCompileContext('inc_');
  const fields = buildSelectFields(select, model, include, registry, includeCtx, compute);
  const whereClause = transformWhereClause(
    Object.keys(whereWithoutId).length ? whereWithoutId : undefined,
    model,
    registry,
  );
  const limitClause = buildLimit(1);

  // Bound, never interpolated: the id part is caller text and the driver's escaper leaves a backslash alone
  const idBinding = createCompileContext('rid_').bind('record', 'id', recordId, 'string');
  const parts = [`SELECT ${fields} FROM ONLY ${idBinding.placeholder}`, whereClause.text, limitClause].filter((p) => p);

  return {
    text: parts.join(' '),
    vars: { ...whereClause.vars, ...idBinding.vars, ...includeCtx.getCollected() },
  };
}

/** Build a findUnique SELECT query using RecordId or unique fields */
export function buildFindUniqueQuery(
  model: ModelMetadata,
  options: FindUniqueOptionsWithInclude,
  registry?: ModelRegistry,
): CompiledQuery {
  const { where, select, include, compute } = options;

  // Validate at least one unique field is present
  hasUniqueField(where, model);

  // Expand composite unique keys and object @unique keys before processing
  let expandedWhere = expandCompositeKey(where, model);
  expandedWhere = expandObjectUniqueKey(expandedWhere, model);

  // Determine query strategy based on ID presence
  const idField = model.fields.find((f) => f.isId);
  const hasId = idField && expandedWhere[idField.name] !== undefined && expandedWhere[idField.name] !== null;

  if (hasId) {
    // Use FROM ONLY table:id (optimized)
    return buildFindUniqueByIdQuery(model, expandedWhere, select, idField!, include, registry, compute);
  }

  // Use FROM ONLY tableName (reuse existing buildFindOneQuery)
  return buildFindOneQuery(model, { where: expandedWhere, select, include, compute }, registry);
}
