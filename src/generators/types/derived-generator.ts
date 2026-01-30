/**
 * Derived type generator - generates Create, Update, Include, and other derived types
 *
 * Uses ts-toolbelt utilities for cleaner type definitions:
 * - O.Optional<T, K> - make keys K optional in T (clearer than Omit + Partial + Pick)
 * - O.Omit<T, K> - omit keys K from T
 * - A.Compute<T> - flatten complex nested types for better IDE tooltips
 */

import type { ModelMetadata, ModelRegistry } from '../../types';

/** Whether to use ts-toolbelt utilities in generated types */
const USE_TS_TOOLBELT = true;

/** Get fields that should be omitted from create (auto-generated) */
function getOmitForCreate(model: ModelMetadata): string[] {
  // Relation fields should be omitted (virtual fields)
  return model.fields.filter((f) => f.type === 'relation').map((f) => f.name);
}

/** Get fields that should be optional in create (have defaults or are auto-generated) */
function getOptionalForCreate(model: ModelMetadata): string[] {
  const optional = new Set<string>();

  for (const field of model.fields) {
    // Skip relation fields (they're omitted entirely)
    if (field.type === 'relation') continue;

    // Fields with default values are optional
    if (field.defaultValue !== undefined) {
      optional.add(field.name);
    }
    // @id fields are optional (db can auto-generate)
    if (field.isId) {
      optional.add(field.name);
    }
    // @now fields are optional (db can auto-generate)
    if (field.hasNowDefault) {
      optional.add(field.name);
    }
    // Optional fields are optional
    if (!field.isRequired) {
      optional.add(field.name);
    }
    // Array fields are optional (defaults to empty array)
    if (field.isArray) {
      optional.add(field.name);
    }
  }

  return Array.from(optional);
}

/** Generate Create type */
export function generateCreateType(model: ModelMetadata): string {
  const omit = getOmitForCreate(model);
  const optional = getOptionalForCreate(model);

  if (!omit.length && !optional.length) return `export type ${model.name}Create = ${model.name};`;

  // Get optional fields that aren't already omitted
  const optionalFields = optional.filter((f) => !omit.includes(f));

  if (omit.length === 0 && optionalFields.length === 0) {
    return `export type ${model.name}Create = ${model.name};`;
  }

  if (USE_TS_TOOLBELT) {
    // Use ts-toolbelt: O.Optional<O.Omit<T, omit>, optional>
    // This is cleaner than Omit + Partial + Pick
    const omitKeys = omit.map((f) => `'${f}'`).join(' | ');
    const optionalKeys = optionalFields.map((f) => `'${f}'`).join(' | ');

    if (omit.length > 0 && optionalFields.length > 0) {
      return `export type ${model.name}Create = O.Optional<O.Omit<${model.name}, ${omitKeys}>, ${optionalKeys}>;`;
    } else if (omit.length > 0) {
      return `export type ${model.name}Create = O.Omit<${model.name}, ${omitKeys}>;`;
    } else {
      return `export type ${model.name}Create = O.Optional<${model.name}, ${optionalKeys}>;`;
    }
  }

  // Fallback: standard TypeScript utilities
  const allOmit = [...omit, ...optionalFields];
  let type = `Omit<${model.name}, ${allOmit.map((f) => `'${f}'`).join(' | ')}>`;

  if (optionalFields.length > 0) {
    type += ` & Partial<Pick<${model.name}, ${optionalFields.map((f) => `'${f}'`).join(' | ')}>>`;
  }

  return `export type ${model.name}Create = ${type};`;
}

/** Map schema type to TypeScript array element type */
function getArrayElementType(schemaType: string): string {
  const typeMap: Record<string, string> = {
    string: 'string',
    email: 'string',
    int: 'number',
    float: 'number',
    bool: 'boolean',
    date: 'Date',
    record: 'string',
  };
  return typeMap[schemaType] ?? 'unknown';
}

/** Generate Update type (all fields partial except id) with array operations for all array types */
export function generateUpdateType(model: ModelMetadata): string {
  const idField = model.fields.find((f) => f.isId);
  const arrayFields = model.fields.filter((f) => f.isArray && f.type !== 'relation');
  const relationFields = model.fields.filter((f) => f.type === 'relation');

  // Fields to exclude from update (id and relation fields)
  const excludeFields = [...(idField ? [idField.name] : []), ...relationFields.map((f) => f.name)];
  const excludeKeys = excludeFields.map((f) => `'${f}'`).join(' | ');

  // If no array fields, use simple type
  if (arrayFields.length === 0) {
    if (excludeFields.length > 0) {
      if (USE_TS_TOOLBELT) {
        return `export type ${model.name}Update = Partial<O.Omit<${model.name}, ${excludeKeys}>>;`;
      }
      return `export type ${model.name}Update = Partial<Omit<${model.name}, ${excludeKeys}>>;`;
    }
    return `export type ${model.name}Update = Partial<${model.name}>;`;
  }

  // Generate interface with array operations for all array fields
  const baseOmit = [...excludeFields, ...arrayFields.map((f) => f.name)];
  const baseOmitKeys = baseOmit.map((f) => `'${f}'`).join(' | ');
  const baseType =
    baseOmit.length > 0
      ? USE_TS_TOOLBELT
        ? `Partial<O.Omit<${model.name}, ${baseOmitKeys}>>`
        : `Partial<Omit<${model.name}, ${baseOmitKeys}>>`
      : `Partial<${model.name}>`;

  const arrayFieldTypes = arrayFields
    .map((f) => {
      const elementType = getArrayElementType(f.type);
      return `  ${f.name}?: ${elementType}[] | {
    push?: ${elementType} | ${elementType}[];
    unset?: ${elementType} | ${elementType}[];
  };`;
    })
    .join('\n');

  return `export type ${model.name}Update = ${baseType} & {
${arrayFieldTypes}
};`;
}

/** Generate Select type (boolean map of fields, requires at least one field) */
export function generateSelectType(model: ModelMetadata): string {
  // Filter out relation fields (virtual fields not stored)
  const fieldNames = model.fields.filter((f) => f.type !== 'relation').map((f) => f.name);

  if (fieldNames.length === 0) {
    return `export interface ${model.name}Select {}`;
  }

  if (fieldNames.length === 1) {
    return `export type ${model.name}Select = { ${fieldNames[0]}: boolean; };`;
  }

  // Generate union where each variant requires at least one field
  // For each field, make it required and all others optional
  const variants = fieldNames.map((field) => {
    const otherFields = fieldNames
      .filter((f) => f !== field)
      .map((f) => `'${f}'`)
      .join(' | ');
    return `  | { ${field}: boolean } & Partial<Record<${otherFields}, boolean>>`;
  });

  return `export type ${model.name}Select =
${variants.join('\n')};`;
}

/** Generate OrderBy type */
export function generateOrderByType(model: ModelMetadata): string {
  // Filter out relation fields (virtual fields not stored)
  const fields = model.fields.filter((f) => f.type !== 'relation').map((f) => `  ${f.name}?: 'asc' | 'desc';`);

  return `export interface ${model.name}OrderBy {
${fields.join('\n')}
}`;
}

/** Check if a model has any relation fields */
function modelHasRelations(modelMetadata: ModelMetadata): boolean {
  return modelMetadata.fields.some((f) => f.type === 'relation' && f.relationInfo);
}

/** Generate Include type for relation fields */
export function generateIncludeType(model: ModelMetadata, registry?: ModelRegistry): string {
  const relationFields = model.fields.filter((f) => f.type === 'relation' && f.relationInfo);

  if (relationFields.length === 0) {
    return ''; // No include type needed
  }

  const fieldTypes = relationFields
    .map((field) => {
      if (!field.relationInfo) return '';
      const targetModel = field.relationInfo.targetModel;

      // Check if target model has relations (and thus an Include type)
      const targetModelMeta = registry?.[targetModel];
      const targetHasInclude = targetModelMeta && modelHasRelations(targetModelMeta);
      const includeOption = targetHasInclude ? `\n    include?: ${targetModel}Include;` : '';

      // Find if the storage field is an array (one-to-many)
      const storageField = field.relationInfo.fieldRef
        ? model.fields.find((f) => f.name === field.relationInfo!.fieldRef)
        : null;

      const isArrayRelation = storageField?.isArray || false;
      const isReverseRelation = field.relationInfo.isReverse;

      // For array relations or reverse relations (both return arrays), include pagination
      if (isArrayRelation || isReverseRelation) {
        return `  ${field.name}?: boolean | {
    select?: ${targetModel}Select;
    where?: ${targetModel}Where;
    orderBy?: ${targetModel}OrderBy;
    limit?: number;
    offset?: number;${includeOption}
  };`;
      }

      // For single relations
      return `  ${field.name}?: boolean | {
    select?: ${targetModel}Select;
    where?: ${targetModel}Where;${includeOption}
  };`;
    })
    .filter((line) => line !== '')
    .join('\n');

  return `export interface ${model.name}Include {
${fieldTypes}
}`;
}

/** Generate $Relations type that maps relation names to their types */
export function generateRelationsType(model: ModelMetadata, registry?: ModelRegistry): string {
  const relationFields = model.fields.filter((f) => f.type === 'relation' && f.relationInfo);

  if (relationFields.length === 0) {
    return `export type ${model.name}$Relations = {};`;
  }

  const fieldTypes = relationFields
    .map((field) => {
      if (!field.relationInfo) return '';
      const targetModel = field.relationInfo.targetModel;

      // Check if target model has relations (and thus an Include type)
      const targetModelMeta = registry?.[targetModel];
      const targetHasInclude = targetModelMeta && modelHasRelations(targetModelMeta);

      // Find if the storage field is an array (one-to-many)
      const storageField = field.relationInfo.fieldRef
        ? model.fields.find((f) => f.name === field.relationInfo!.fieldRef)
        : null;

      const isArrayRelation = storageField?.isArray || false;
      const isReverseRelation = field.relationInfo.isReverse;

      // Determine the relation type (single or array)
      const relationType = isArrayRelation || isReverseRelation ? `${targetModel}[]` : targetModel;
      const includeType = targetHasInclude ? `${targetModel}Include` : 'never';

      return `  ${field.name}: { type: ${relationType}; include: ${includeType} };`;
    })
    .filter((line) => line !== '')
    .join('\n');

  return `export type ${model.name}$Relations = {
${fieldTypes}
};`;
}

/** Helper to generate the select payload type for a relation */
function generateRelationSelectPayload(targetModel: string): string {
  return `{ [P in keyof S as S[P] extends true ? P : never]: P extends keyof ${targetModel} ? ${targetModel}[P] : never }`;
}

/** Generate IncludePayload helper type for a model */
export function generateIncludePayloadType(model: ModelMetadata, registry?: ModelRegistry): string {
  const relationFields = model.fields.filter((f) => f.type === 'relation' && f.relationInfo);

  if (relationFields.length === 0) {
    return '';
  }

  // Generate a clean conditional type for each relation
  const relationPayloads = relationFields
    .map((field) => {
      if (!field.relationInfo) return '';
      const targetModel = field.relationInfo.targetModel;
      const targetModelMeta = registry?.[targetModel];
      const targetHasInclude = targetModelMeta && modelHasRelations(targetModelMeta);

      const storageField = field.relationInfo.fieldRef
        ? model.fields.find((f) => f.name === field.relationInfo!.fieldRef)
        : null;
      const isArray = storageField?.isArray || field.relationInfo.isReverse;
      const wrapArray = (t: string) => (isArray ? `${t}[]` : t);
      const selectPayload = generateRelationSelectPayload(targetModel);

      let typeBody: string;
      if (targetHasInclude) {
        typeBody = `I['${field.name}'] extends true
      ? ${wrapArray(targetModel)}
      : I['${field.name}'] extends { select: infer S extends ${targetModel}Select; include: infer NI extends ${targetModel}Include }
        ? ${wrapArray(`(${selectPayload} & Get${targetModel}IncludePayload<NI>)`)}
        : I['${field.name}'] extends { select: infer S extends ${targetModel}Select }
          ? ${wrapArray(selectPayload)}
          : I['${field.name}'] extends { include: infer NI extends ${targetModel}Include }
            ? ${wrapArray(`(${targetModel} & Get${targetModel}IncludePayload<NI>)`)}
            : ${wrapArray(targetModel)}`;
      } else {
        typeBody = `I['${field.name}'] extends true
      ? ${wrapArray(targetModel)}
      : I['${field.name}'] extends { select: infer S extends ${targetModel}Select }
        ? ${wrapArray(selectPayload)}
        : ${wrapArray(targetModel)}`;
      }

      return `  ${field.name}: ${typeBody};`;
    })
    .filter((line) => line !== '')
    .join('\n');

  return `export type Get${model.name}IncludePayload<I extends ${model.name}Include | undefined> = I extends ${model.name}Include
  ? Pick<{
${relationPayloads}
    }, Extract<keyof I, keyof ${model.name}$Relations> & { [K in keyof I]: I[K] extends false | undefined ? never : K }[keyof I]>
  : {};`;
}

/** Generate GetPayload type for a model - computes result type based on select/include */
export function generateGetPayloadType(model: ModelMetadata): string {
  const hasRelationFields = model.fields.some((f) => f.type === 'relation' && f.relationInfo);

  // A.Compute flattens complex conditional types for better IDE tooltips
  const wrapCompute = (type: string) => (USE_TS_TOOLBELT ? `A.Compute<${type}>` : type);

  if (!hasRelationFields) {
    // No relations - simple select-only inference
    const innerType = `S extends ${model.name}Select
  ? { [K in keyof S as S[K] extends true ? K : never]: K extends keyof ${model.name} ? ${model.name}[K] : never }
  : ${model.name}`;

    return `export type Get${model.name}Payload<
  S extends ${model.name}Select | undefined = undefined,
  I = undefined,
> = ${wrapCompute(innerType)};`;
  }

  // With relations - full inference
  const innerType = `S extends ${model.name}Select
  ? { [K in keyof S as S[K] extends true ? K : never]: K extends keyof ${model.name} ? ${model.name}[K] : never }
    & Get${model.name}IncludePayload<I>
  : I extends ${model.name}Include
    ? ${model.name} & Get${model.name}IncludePayload<I>
    : ${model.name}`;

  return `export type Get${model.name}Payload<
  S extends ${model.name}Select | undefined = undefined,
  I extends ${model.name}Include | undefined = undefined,
> = ${wrapCompute(innerType)};`;
}

/** Generate all derived types for a model */
export function generateDerivedTypes(model: ModelMetadata, registry?: ModelRegistry): string {
  const types = [
    generateCreateType(model),
    generateUpdateType(model),
    generateSelectType(model),
    generateOrderByType(model),
  ];

  const includeType = generateIncludeType(model, registry);
  if (includeType) {
    types.push(includeType);
  }

  // Add relations type
  types.push(generateRelationsType(model, registry));

  // Add include payload helper type (only if model has relations)
  const includePayloadType = generateIncludePayloadType(model, registry);
  if (includePayloadType) {
    types.push(includePayloadType);
  }

  // Add GetPayload type
  types.push(generateGetPayloadType(model));

  return types.join('\n\n');
}

/** Generate derived types for all models */
export function generateAllDerivedTypes(models: ModelMetadata[], registry?: ModelRegistry): string {
  return models.map((model) => generateDerivedTypes(model, registry)).join('\n\n');
}
