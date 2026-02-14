/**
 * Method generator - generates query method signatures
 */

import { getUniqueFields } from '../../parser/model-metadata';
import type { CompositeIndex, FieldMetadata, ModelMetadata, ObjectMetadata, ObjectRegistry } from '../../types';
import { schemaTypeToTsType } from '../../utils/type-utils';

/** Check if model has relation fields */
function hasRelations(model: ModelMetadata): boolean {
  return model.fields.some((f) => f.type === 'relation' && f.relationInfo);
}

/** Generate findOne method signature with full type inference */
export function generateFindOneMethod(model: ModelMetadata): string {
  if (!hasRelations(model)) {
    // No relations - simpler generic signature
    return `findOne<S extends ${model.name}Select | undefined = undefined>(options?: {
    where?: ${model.name}Where;
    select?: S;
  }): CerialQueryPromise<Get${model.name}Payload<S> | null>;`;
  }

  // With relations - full generic signature
  return `findOne<
    S extends ${model.name}Select | undefined = undefined,
    I extends ${model.name}Include | undefined = undefined,
  >(options?: {
    where?: ${model.name}Where;
    select?: S;
    include?: I;
  }): CerialQueryPromise<Get${model.name}Payload<S, I> | null>;`;
}

/** Generate findMany method signature with full type inference */
export function generateFindManyMethod(model: ModelMetadata): string {
  if (!hasRelations(model)) {
    // No relations - simpler generic signature
    return `findMany<S extends ${model.name}Select | undefined = undefined>(options?: {
    where?: ${model.name}Where;
    select?: S;
    orderBy?: ${model.name}OrderBy;
    limit?: number;
    offset?: number;
  }): CerialQueryPromise<Get${model.name}Payload<S>[]>;`;
  }

  // With relations - full generic signature
  return `findMany<
    S extends ${model.name}Select | undefined = undefined,
    I extends ${model.name}Include | undefined = undefined,
  >(options?: {
    where?: ${model.name}Where;
    select?: S;
    orderBy?: ${model.name}OrderBy;
    limit?: number;
    offset?: number;
    include?: I;
  }): CerialQueryPromise<Get${model.name}Payload<S, I>[]>;`;
}

/** Get input type for a field (RecordIdInput for ID/Record, object type for objects, regular type for primitives) */
function getFieldInputType(field: FieldMetadata): string {
  if (field.isId || field.type === 'record') return 'RecordIdInput';
  if (field.type === 'object' && field.objectInfo) return field.objectInfo.objectName;

  return schemaTypeToTsType(field.type as Parameters<typeof schemaTypeToTsType>[0]);
}

/**
 * Build a nested TypeScript type shape for a composite unique key.
 * Handles dot-notation fields by creating nested objects.
 *
 * For example, given fields ["address.city", "name"] with types [string, string]:
 * Returns "{ address: { city: string }; name: string }"
 */
function buildCompositeKeyType(
  directive: CompositeIndex,
  model: ModelMetadata,
  objectRegistry?: ObjectRegistry,
): string {
  // Build a nested object structure for the fields
  interface TypeNode {
    type?: string;
    children?: Record<string, TypeNode>;
  }

  const root: Record<string, TypeNode> = {};

  for (const fieldRef of directive.fields) {
    const parts = fieldRef.split('.');

    if (parts.length === 1) {
      // Top-level field
      const field = model.fields.find((f) => f.name === fieldRef);
      if (!field) continue;

      const tsType = getFieldInputType(field);
      const nullSuffix = !field.isRequired && !field.isId ? ' | null' : '';
      root[fieldRef] = { type: `${tsType}${nullSuffix}` };
    } else {
      // Dot-notation: build nested structure
      let current = root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;

        if (i === parts.length - 1) {
          // Leaf node — resolve the type from the object definition
          const tsType = resolveCompositeFieldType(parts, model, objectRegistry);
          current[part] = { type: tsType };
        } else {
          // Intermediate node — create/access children
          if (!current[part]) {
            current[part] = { children: {} };
          } else if (!current[part]!.children) {
            current[part]!.children = {};
          }
          current = current[part]!.children!;
        }
      }
    }
  }

  // Serialize the tree into a TypeScript type string
  function serializeNode(node: Record<string, TypeNode>): string {
    const entries = Object.entries(node).map(([key, value]) => {
      if (value.type) return `${key}: ${value.type}`;
      if (value.children) return `${key}: ${serializeNode(value.children)}`;

      return `${key}: unknown`;
    });

    return `{ ${entries.join('; ')} }`;
  }

  return serializeNode(root);
}

/** Resolve the TypeScript type for a dot-notation field reference */
function resolveCompositeFieldType(parts: string[], model: ModelMetadata, objectRegistry?: ObjectRegistry): string {
  const topField = model.fields.find((f) => f.name === parts[0]);
  if (!topField || topField.type !== 'object' || !topField.objectInfo) return 'unknown';

  let objectName = topField.objectInfo.objectName;
  for (let i = 1; i < parts.length; i++) {
    const objectMeta = objectRegistry?.[objectName];
    if (!objectMeta) return 'unknown';

    const subField = objectMeta.fields.find((f) => f.name === parts[i]);
    if (!subField) return 'unknown';

    if (i === parts.length - 1) {
      // Final field — return its type
      const tsType = schemaTypeToTsType(subField.type as Parameters<typeof schemaTypeToTsType>[0]);
      const nullSuffix = !subField.isRequired ? ' | null' : '';

      return `${tsType}${nullSuffix}`;
    }

    // Intermediate — must be an object
    if (subField.type !== 'object' || !subField.objectInfo) return 'unknown';
    objectName = subField.objectInfo.objectName;
  }

  return 'unknown';
}

/**
 * Build JSDoc comment for a composite unique key in FindUniqueWhere.
 * Includes warnings for optional fields.
 */
function buildCompositeJsDoc(directive: CompositeIndex, model: ModelMetadata): string {
  const lines: string[] = [];
  lines.push(`  /**`);
  lines.push(`   * Composite unique index on fields: ${directive.fields.join(', ')}`);

  // Check for optional fields and add warnings
  const optionalFields: string[] = [];
  for (const fieldRef of directive.fields) {
    const parts = fieldRef.split('.');
    const topField = model.fields.find((f) => f.name === parts[0]);
    if (topField && !topField.isRequired && !topField.isId) {
      optionalFields.push(fieldRef);
    }
  }

  if (optionalFields.length) {
    lines.push(`   *`);
    lines.push(`   * @warning Optional field(s): ${optionalFields.join(', ')}`);
    lines.push(`   * Unlike single-field @unique, composite unique indexes treat null/NONE as concrete values`);
    lines.push(`   * when at least one field has a non-null value.`);
    lines.push(`   *`);
    lines.push(`   * | Combination                       | Duplicate allowed? |`);
    lines.push(`   * | ---------------------------------- | ------------------ |`);
    lines.push(`   * | (null, null) + (null, null)        | YES                |`);
    lines.push(`   * | (null, 'value') + (null, 'value')  | NO                 |`);
    lines.push(`   * | ('value', null) + ('value', null)  | NO                 |`);
    lines.push(`   * | ('value', 'value') + same          | NO                 |`);
  }

  lines.push(`   */`);

  return lines.join('\n');
}

/**
 * Collect object @unique fields for a model.
 * For each model field that is an object type, find all @unique subfields (recursively).
 * Returns an array of { modelFieldName, nestedType } for each unique subfield path.
 *
 * Example: If User has `address Address` and Address has `zip String @unique`,
 * returns [{ fieldName: 'address', nestedType: '{ zip: string }' }]
 */
function collectObjectUniqueVariants(
  model: ModelMetadata,
  objectRegistry?: ObjectRegistry,
): { fieldName: string; nestedType: string }[] {
  if (!objectRegistry) return [];
  const variants: { fieldName: string; nestedType: string }[] = [];

  for (const field of model.fields) {
    if (field.type !== 'object' || !field.objectInfo) continue;
    // Skip array object fields — per-element uniqueness is blocked at parse time
    if (field.isArray) continue;

    const objectMeta = objectRegistry[field.objectInfo.objectName];
    if (!objectMeta) continue;

    // Collect all unique subfield paths from this object (including nested objects)
    const uniquePaths = collectUniqueSubfieldPaths(objectMeta, objectRegistry);
    for (const { path, tsType } of uniquePaths) {
      // Build nested type: { zip: string } or { inner: { code: string } }
      const nestedType = buildNestedTypeFromPath(path, tsType);
      variants.push({ fieldName: field.name, nestedType });
    }
  }

  return variants;
}

/**
 * Recursively collect unique subfield paths from an object.
 * Returns array of { path: string[], tsType: string } for each @unique field.
 */
function collectUniqueSubfieldPaths(
  object: ObjectMetadata,
  objectRegistry: ObjectRegistry,
  prefix: string[] = [],
  visited: Set<string> = new Set(),
): { path: string[]; tsType: string }[] {
  const results: { path: string[]; tsType: string }[] = [];

  for (const field of object.fields) {
    if (field.type === 'object' && field.objectInfo && !field.isArray) {
      const nestedName = field.objectInfo.objectName;
      if (visited.has(nestedName)) continue;

      const nested = objectRegistry[nestedName];
      if (nested) {
        const nextVisited = new Set(visited);
        nextVisited.add(nestedName);
        results.push(...collectUniqueSubfieldPaths(nested, objectRegistry, [...prefix, field.name], nextVisited));
      }
    } else if (field.isUnique) {
      const tsType = schemaTypeToTsType(field.type as Parameters<typeof schemaTypeToTsType>[0]);
      const nullSuffix = !field.isRequired ? ' | null' : '';
      results.push({ path: [...prefix, field.name], tsType: `${tsType}${nullSuffix}` });
    }
  }

  return results;
}

/**
 * Build a nested TypeScript type from a path array and leaf type.
 * e.g., ['inner', 'code'] with 'string' => '{ inner: { code: string } }'
 */
function buildNestedTypeFromPath(path: string[], tsType: string): string {
  if (path.length === 0) return tsType;
  if (path.length === 1) return `{ ${path[0]}: ${tsType} }`;

  // Build from inside out
  let result = tsType;
  for (let i = path.length - 1; i >= 0; i--) {
    result = `{ ${path[i]}: ${result} }`;
  }

  return result;
}

/** Generate FindUniqueWhere type for a model */
export function generateFindUniqueWhereType(model: ModelMetadata, objectRegistry?: ObjectRegistry): string {
  // Get ID field
  const idField = model.fields.find((f) => f.isId);

  // Get unique fields (excluding ID since it's handled separately)
  const uniqueFields = getUniqueFields(model).filter((f) => !f.isId);

  // Get composite unique directives
  const compositeUniques = (model.compositeDirectives ?? []).filter((d) => d.kind === 'unique');

  // Get object @unique variants (object fields with @unique subfields)
  const objectUniqueVariants = collectObjectUniqueVariants(model, objectRegistry);

  // Get all unique field names (for single-field unique variants)
  const allUniqueFieldNames = [idField?.name, ...uniqueFields.map((f) => f.name)].filter(Boolean);

  // Composite key names to omit from the Where type
  const compositeKeyNames = compositeUniques.map((d) => d.name);
  // Object unique field names (model-level field names) to omit from the Where type
  const objectUniqueFieldNames = [...new Set(objectUniqueVariants.map((v) => v.fieldName))];
  const allOmitKeys = [...allUniqueFieldNames, ...compositeKeyNames, ...objectUniqueFieldNames];

  // If no unique fields, no composite uniques, and no object uniques, no FindUniqueWhere type
  if (allOmitKeys.length === 0) {
    return '';
  }

  // Build union type: one variant per unique field + one per composite unique
  const variants: string[] = [];
  const omitStr = allOmitKeys.map((n) => `'${n}'`).join(' | ');

  // Helper to build optional unique fields type (excluding the required one)
  const buildOptionalUniqueFields = (excludeField: string): string => {
    const otherUniqueFields = allUniqueFieldNames.filter((n) => n !== excludeField);
    if (otherUniqueFields.length === 0) return '';

    const optionalFields = otherUniqueFields
      .map((fieldName) => {
        const field = model.fields.find((f) => f.name === fieldName);
        const tsType = getFieldInputType(field!);

        return `${fieldName}?: ${tsType}`;
      })
      .join('; ');

    return ` & { ${optionalFields} }`;
  };

  // ID variant: { id: RecordIdInput } & { email?: string } & Omit<UserWhere, 'id' | 'email'>
  if (idField) {
    const optionalUnique = buildOptionalUniqueFields(idField.name);
    variants.push(`({ ${idField.name}: RecordIdInput }${optionalUnique} & Omit<${model.name}Where, ${omitStr}>)`);
  }

  // Single-field unique variants: { email: string } & { id?: RecordIdInput } & Omit<UserWhere, ...>
  for (const field of uniqueFields) {
    const tsType = getFieldInputType(field);
    const optionalUnique = buildOptionalUniqueFields(field.name);
    variants.push(`({ ${field.name}: ${tsType} }${optionalUnique} & Omit<${model.name}Where, ${omitStr}>)`);
  }

  // Composite unique variants: { compositeKeyName: { field1: Type1, field2: Type2 } } & Omit<...>
  for (const directive of compositeUniques) {
    const keyType = buildCompositeKeyType(directive, model, objectRegistry);
    const jsDoc = buildCompositeJsDoc(directive, model);
    variants.push(`(${jsDoc}\n  { ${directive.name}: ${keyType} } & Omit<${model.name}Where, ${omitStr}>)`);
  }

  // Object @unique variants: { address: { zip: string } } & Omit<Where, ...>
  for (const variant of objectUniqueVariants) {
    variants.push(`({ ${variant.fieldName}: ${variant.nestedType} } & Omit<${model.name}Where, ${omitStr}>)`);
  }

  return `export type ${model.name}FindUniqueWhere = ${variants.join('\n  | ')};`;
}

/** Generate findUnique method signature with full type inference */
export function generateFindUniqueMethod(model: ModelMetadata): string {
  if (!hasRelations(model)) {
    return `findUnique<S extends ${model.name}Select | undefined = undefined>(options: {
    where: ${model.name}FindUniqueWhere;
    select?: S;
  }): CerialQueryPromise<Get${model.name}Payload<S> | null>;`;
  }

  return `findUnique<
    S extends ${model.name}Select | undefined = undefined,
    I extends ${model.name}Include | undefined = undefined,
  >(options: {
    where: ${model.name}FindUniqueWhere;
    select?: S;
    include?: I;
  }): CerialQueryPromise<Get${model.name}Payload<S, I> | null>;`;
}

/** Generate create method signature with full type inference */
export function generateCreateMethod(model: ModelMetadata): string {
  // Create doesn't support include, only select
  // Use CreateInput to support both raw fields and nested relations
  return `create<S extends ${model.name}Select | undefined = undefined>(options: {
    data: ${model.name}CreateInput;
    select?: S;
  }): CerialQueryPromise<Get${model.name}Payload<S>>;`;
}

/** Generate updateMany method signature with full type inference */
export function generateUpdateMethod(model: ModelMetadata): string {
  // UpdateMany doesn't support include, only select
  // Use UpdateInput to support both raw fields and nested relations
  // Generic D enables SafeUnset to cross-exclude fields that appear in data
  return `updateMany<
    S extends ${model.name}Select | undefined = undefined,
    D extends ${model.name}UpdateInput = ${model.name}UpdateInput
  >(options: {
    where: ${model.name}Where;
    data: D;
    unset?: SafeUnset<${model.name}Unset, D>;
    select?: S;
  }): CerialQueryPromise<Get${model.name}Payload<S>[]>;`;
}

/** Generate deleteMany method signature */
export function generateDeleteManyMethod(model: ModelMetadata): string {
  return `deleteMany(options: {
    where: ${model.name}Where;
  }): CerialQueryPromise<number>;`;
}

/**
 * Generate deleteUnique method signature with return type inference
 * Uses FindUniqueWhere to require at least one unique field
 */
export function generateDeleteUniqueMethod(model: ModelMetadata): string {
  return `deleteUnique<R extends DeleteUniqueReturn = undefined>(options: {
    where: ${model.name}FindUniqueWhere;
    /**
     * Return option for the deleted record
     * - undefined/null: returns boolean (always true - operation succeeded)
     * - true: returns boolean (true if record existed, false if not)
     * - 'before': returns ${model.name} | null (deleted data)
     */
    return?: R;
  }): CerialQueryPromise<DeleteUniqueReturnType<${model.name}, R>>;`;
}

/**
 * Generate updateUnique method signature with return type inference
 * Uses FindUniqueWhere to require at least one unique field
 * Supports select/include for 'after'/default modes
 */
export function generateUpdateUniqueMethod(model: ModelMetadata): string {
  if (!hasRelations(model)) {
    // No relations - simpler generic signature (no include)
    return `updateUnique<
    S extends ${model.name}Select | undefined = undefined,
    D extends ${model.name}UpdateInput = ${model.name}UpdateInput,
    R extends UpdateUniqueReturn = undefined
  >(options: {
    where: ${model.name}FindUniqueWhere;
    data: D;
    unset?: SafeUnset<${model.name}Unset, D>;
    select?: S;
    /**
     * Return option for the updated record
     * - undefined/null/'after': returns updated record (supports select)
     * - true: returns boolean (true if found and updated, false if not)
     * - 'before': returns ${model.name} | null (pre-update state, no select support)
     */
    return?: R;
  }): CerialQueryPromise<UpdateUniqueReturnType<Get${model.name}Payload<S>, R>>;`;
  }

  // With relations - full generic signature with include
  return `updateUnique<
    S extends ${model.name}Select | undefined = undefined,
    I extends ${model.name}Include | undefined = undefined,
    D extends ${model.name}UpdateInput = ${model.name}UpdateInput,
    R extends UpdateUniqueReturn = undefined
  >(options: {
    where: ${model.name}FindUniqueWhere;
    data: D;
    unset?: SafeUnset<${model.name}Unset, D>;
    select?: S;
    include?: I;
    /**
      * Return option for the updated record
      * - undefined/null/'after': returns updated record (supports select/include)
      * - true: returns boolean (true if found and updated, false if not)
      * - 'before': returns ${model.name} | null (pre-update state, no select/include support)
      */
    return?: R;
  }): CerialQueryPromise<UpdateUniqueReturnType<Get${model.name}Payload<S, I>, R>>;`;
}

/**
 * Generate upsert method signature with return type inference.
 * Two overloads:
 * 1. FindUniqueWhere → single result (with return option support)
 * 2. General Where → array result
 */
export function generateUpsertMethod(model: ModelMetadata): string {
  const uniqueOverload = generateUpsertUniqueOverload(model);
  const arrayOverload = generateUpsertArrayOverload(model);

  return `${uniqueOverload}\n\n  ${arrayOverload}`;
}

/** Generate upsert overload for unique where (single result) */
function generateUpsertUniqueOverload(model: ModelMetadata): string {
  if (!hasRelations(model)) {
    return `upsert<
    S extends ${model.name}Select | undefined = undefined,
    D extends ${model.name}UpdateInput = ${model.name}UpdateInput,
    R extends UpsertReturn = undefined
  >(options: {
    where: ${model.name}FindUniqueWhere;
    create: ${model.name}CreateInput;
    update?: D;
    unset?: SafeUnset<${model.name}Unset, D>;
    select?: S;
    /**
     * Return option for the upserted record
     * - undefined/null/'after': returns upserted record (supports select)
     * - true: returns boolean (true if record was created or updated)
     * - 'before': returns previous state | null (null for new records)
     */
    return?: R;
  }): CerialQueryPromise<UpsertReturnType<Get${model.name}Payload<S>, R>>;`;
  }

  return `upsert<
    S extends ${model.name}Select | undefined = undefined,
    I extends ${model.name}Include | undefined = undefined,
    D extends ${model.name}UpdateInput = ${model.name}UpdateInput,
    R extends UpsertReturn = undefined
  >(options: {
    where: ${model.name}FindUniqueWhere;
    create: ${model.name}CreateInput;
    update?: D;
    unset?: SafeUnset<${model.name}Unset, D>;
    select?: S;
    include?: I;
    /**
     * Return option for the upserted record
     * - undefined/null/'after': returns upserted record (supports select/include)
     * - true: returns boolean (true if record was created or updated)
     * - 'before': returns previous state | null (null for new records)
     */
    return?: R;
  }): CerialQueryPromise<UpsertReturnType<Get${model.name}Payload<S, I>, R>>;`;
}

/** Generate upsert overload for general where (array result) */
function generateUpsertArrayOverload(model: ModelMetadata): string {
  if (!hasRelations(model)) {
    return `upsert<
    S extends ${model.name}Select | undefined = undefined,
    D extends ${model.name}UpdateInput = ${model.name}UpdateInput,
    R extends UpsertReturn = undefined
  >(options: {
    where: ${model.name}Where;
    create: ${model.name}CreateInput;
    update?: D;
    unset?: SafeUnset<${model.name}Unset, D>;
    select?: S;
    /**
     * Return option for the upserted record
     * - undefined/null/'after': returns upserted records
     * - true: returns boolean (true if any records were affected)
     * - 'before': returns previous states of matched records
     */
    return?: R;
  }): CerialQueryPromise<UpsertArrayReturnType<Get${model.name}Payload<S>, R>>;`;
  }

  return `upsert<
    S extends ${model.name}Select | undefined = undefined,
    I extends ${model.name}Include | undefined = undefined,
    D extends ${model.name}UpdateInput = ${model.name}UpdateInput,
    R extends UpsertReturn = undefined
  >(options: {
    where: ${model.name}Where;
    create: ${model.name}CreateInput;
    update?: D;
    unset?: SafeUnset<${model.name}Unset, D>;
    select?: S;
    include?: I;
    /**
     * Return option for the upserted record
     * - undefined/null/'after': returns upserted records
     * - true: returns boolean (true if any records were affected)
     * - 'before': returns previous states of matched records
     */
    return?: R;
  }): CerialQueryPromise<UpsertArrayReturnType<Get${model.name}Payload<S, I>, R>>;`;
}

/** Generate count method signature */
export function generateCountMethod(model: ModelMetadata): string {
  return `count(where?: ${model.name}Where): CerialQueryPromise<number>;`;
}

/** Generate exists method signature */
export function generateExistsMethod(model: ModelMetadata): string {
  return `exists(where?: ${model.name}Where): CerialQueryPromise<boolean>;`;
}

/** Generate all method signatures for a model */
export function generateMethodSignatures(model: ModelMetadata): string[] {
  return [
    generateFindOneMethod(model),
    generateFindManyMethod(model),
    generateFindUniqueMethod(model),
    generateCreateMethod(model),
    generateUpdateMethod(model),
    generateUpdateUniqueMethod(model),
    generateUpsertMethod(model),
    generateDeleteManyMethod(model),
    generateDeleteUniqueMethod(model),
    generateCountMethod(model),
    generateExistsMethod(model),
  ];
}
