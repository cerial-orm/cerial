/**
 * Where type generator - generates where clause types for models
 */

import type { FieldMetadata, ModelMetadata, ModelRegistry } from '../../types';
import { schemaTypeToTsType } from '../../utils/type-utils';
import { getLiteralTypeName, getLiteralWhereName } from './enums';

/** Generate comparison operators for numeric types */
function generateNumericComparisonOps(tsType: string): string {
  return `{
    eq?: ${tsType};
    neq?: ${tsType};
    gt?: ${tsType};
    gte?: ${tsType};
    lt?: ${tsType};
    lte?: ${tsType};
  }`;
}

/** Generate comparison operators for string types (no ordering) */
function generateStringComparisonOps(tsType: string): string {
  return `{
    eq?: ${tsType};
    neq?: ${tsType};
  }`;
}

/** Generate string operators */
function generateStringOps(): string {
  return `{
    contains?: string;
    startsWith?: string;
    endsWith?: string;
  }`;
}

/** Generate array operators for a type */
function generateArrayOps(tsType: string): string {
  return `{
    in?: ${tsType}[];
    notIn?: ${tsType}[];
  }`;
}

/** Generate special operators for numeric/date types (includes between) */
function generateNumericSpecialOps(tsType: string, isRequired: boolean, isId: boolean, isNullable?: boolean): string {
  // @id fields are always present in DB, so never include isNull/isNone/not
  if (isId) {
    return `{
    between?: [${tsType}, ${tsType}];
  }`;
  }

  const ops: string[] = [];

  // `not` operator: always available but type includes | null only if @nullable
  if (!isRequired || isNullable) {
    ops.push(`    not?: ${tsType}${isNullable ? ' | null' : ''};`);
  }

  // isNull only on @nullable fields
  if (isNullable) {
    ops.push(`    isNull?: boolean;`);
  }

  // isNone only on optional (?) fields
  if (!isRequired) {
    ops.push(`    isNone?: boolean;`);
  }

  ops.push(`    between?: [${tsType}, ${tsType}];`);

  return `{\n${ops.join('\n')}\n  }`;
}

/** Generate special operators for string types (no between) */
function generateStringSpecialOps(isRequired: boolean, isId: boolean, isNullable?: boolean): string {
  // @id fields are always present in DB, so never include isNull/isNone/not
  if (isId) {
    return `{}`;
  }

  const ops: string[] = [];

  // `not` operator: always available but type includes | null only if @nullable
  if (!isRequired || isNullable) {
    ops.push(`    not?: string${isNullable ? ' | null' : ''};`);
  }

  // isNull only on @nullable fields
  if (isNullable) {
    ops.push(`    isNull?: boolean;`);
  }

  // isNone only on optional (?) fields
  if (!isRequired) {
    ops.push(`    isNone?: boolean;`);
  }

  if (!ops.length) return `{}`;

  return `{\n${ops.join('\n')}\n  }`;
}

/** Generate array field operators for any array type */
function generateArrayFieldOps(elementType: string): string {
  return `{
    has?: ${elementType};
    hasAll?: ${elementType}[];
    hasAny?: ${elementType}[];
    isEmpty?: boolean;
  }`;
}

/** Generate field where type */
export function generateFieldWhereType(field: FieldMetadata, _registry?: ModelRegistry): string {
  const tsType = schemaTypeToTsType(field.type);
  const { isRequired, isId, isNullable } = field;

  // @nullable fields can be queried with `null` directly (filter for null values)
  const nullablePrefix = isNullable && !isId ? 'null | ' : '';

  // Skip Relation fields in base where type generation
  // They are handled separately with nested where support
  if (field.type === 'relation') {
    return '';
  }

  // Literal fields are handled by the model/object where generators, not here
  if (field.type === 'literal') {
    return '';
  }

  // Handle array types (String[], Int[], Date[], Record[], etc.)
  if (field.isArray) {
    // For Record[] arrays, use RecordIdInput for input types
    const inputType = field.type === 'record' ? 'RecordIdInput' : tsType;

    return `${inputType}[] | ${generateArrayFieldOps(inputType)}`;
  }

  // Handle Record (single record ID) - accepts RecordIdInput
  if (field.type === 'record') {
    return `${nullablePrefix}RecordIdInput | (
    ${generateStringComparisonOps('RecordIdInput')} &
    ${generateStringOps()} &
    ${generateArrayOps('RecordIdInput')} &
    ${generateStringSpecialOps(isRequired, isId, isNullable)}
  )`;
  }

  // For numeric types, include all comparison operators and between
  if (field.type === 'int' || field.type === 'float' || field.type === 'number') {
    return `${nullablePrefix}${tsType} | (
    ${generateNumericComparisonOps(tsType)} &
    ${generateArrayOps(tsType)} &
    ${generateNumericSpecialOps(tsType, isRequired, isId, isNullable)}
  )`;
  }

  // For string types, include string operators (no ordering, no between)
  if (field.type === 'string' || field.type === 'email') {
    return `${nullablePrefix}${tsType} | (
    ${generateStringComparisonOps(tsType)} &
    ${generateStringOps()} &
    ${generateArrayOps(tsType)} &
    ${generateStringSpecialOps(isRequired, isId, isNullable)}
  )`;
  }

  // UUID supports comparison + array operators (orderable in SurrealDB)
  if (field.type === 'uuid') {
    return `${nullablePrefix}CerialUuidInput | (
    ${generateNumericComparisonOps('CerialUuidInput')} &
    ${generateArrayOps('CerialUuidInput')} &
    ${generateStringSpecialOps(isRequired, isId, isNullable)}
  )`;
  }

  // Duration supports comparison + array operators (orderable in SurrealDB)
  if (field.type === 'duration') {
    return `${nullablePrefix}CerialDurationInput | (
    ${generateNumericComparisonOps('CerialDurationInput')} &
    ${generateArrayOps('CerialDurationInput')} &
    ${generateNumericSpecialOps('CerialDurationInput', isRequired, isId, isNullable)}
  )`;
  }

  // For date types, include comparison, array, and between (no string ops)
  if (field.type === 'date') {
    return `${nullablePrefix}${tsType} | (
    ${generateNumericComparisonOps(tsType)} &
    ${generateArrayOps(tsType)} &
    ${generateNumericSpecialOps(tsType, isRequired, isId, isNullable)}
  )`;
  }

  // For boolean types, use basic comparison + special (no between, no in/notIn)
  if (field.type === 'bool') {
    return `${nullablePrefix}${tsType} | (
    ${generateStringComparisonOps(tsType)} &
    ${generateStringSpecialOps(isRequired, isId, isNullable)}
  )`;
  }

  // For other types, use basic comparison + array + special (no between)
  return `${nullablePrefix}${tsType} | (
    ${generateStringComparisonOps(tsType)} &
    ${generateArrayOps(tsType)} &
    ${generateStringSpecialOps(isRequired, isId, isNullable)}
  )`;
}

/** Build JSDoc annotation for a field's index/unique status */
function buildFieldJsDoc(field: FieldMetadata, model: ModelMetadata): string | null {
  const annotations: string[] = [];

  // Field-level @index
  if (field.isIndexed) {
    annotations.push('@index \u2014 Indexed field');
  }

  // Field-level @unique
  if (field.isUnique && !field.isId) {
    if (!field.isRequired) {
      annotations.push('@unique \u2014 Unique indexed field (multiple null/NONE values are allowed)');
    } else {
      annotations.push('@unique \u2014 Unique indexed field');
    }
  }

  // Check if field participates in any composite directives
  for (const directive of model.compositeDirectives ?? []) {
    const participatingFields = directive.fields.filter((ref) => {
      const root = ref.split('.')[0];

      return root === field.name;
    });

    if (participatingFields.length) {
      const otherFields = directive.fields.filter((f) => !participatingFields.includes(f));
      const kindLabel = directive.kind === 'unique' ? 'unique' : 'index';
      if (otherFields.length) {
        annotations.push(
          `@@${kindLabel}("${directive.name}") \u2014 Part of composite ${kindLabel} (with: ${otherFields.join(', ')})`,
        );
      } else {
        annotations.push(`@@${kindLabel}("${directive.name}") \u2014 Part of composite ${kindLabel}`);
      }
    }
  }

  if (!annotations.length) return null;

  if (annotations.length === 1) {
    return `  /** ${annotations[0]} */`;
  }

  const lines = annotations.map((a) => `   * ${a}`);

  return `  /**\n${lines.join('\n')}\n   */`;
}

/** Generate Where interface for a model */
export function generateWhereInterface(model: ModelMetadata, registry?: ModelRegistry): string {
  const fields: string[] = [];

  for (const field of model.fields) {
    // @now (COMPUTED) fields are not stored — skip from Where type
    if (field.timestampDecorator === 'now') continue;

    // Build JSDoc for index/unique annotations
    const jsDoc = buildFieldJsDoc(field, model);

    if (field.type === 'relation') {
      // Relation fields get nested where type
      if (field.relationInfo) {
        const targetWhere = `${field.relationInfo.targetModel}Where`;

        if (field.isArray) {
          // Array relations support some/every/none operators
          if (jsDoc) fields.push(jsDoc);
          fields.push(`  ${field.name}?: { some?: ${targetWhere}; every?: ${targetWhere}; none?: ${targetWhere}; };`);
        } else {
          // Single relations - @nullable ones accept `null` to filter by null underlying record field
          // Look at the storage field for nullable info
          const storageField = field.relationInfo.fieldRef
            ? model.fields.find((f) => f.name === field.relationInfo!.fieldRef)
            : null;
          const nullPrefix = storageField?.isNullable ? 'null | ' : '';
          if (jsDoc) fields.push(jsDoc);
          fields.push(`  ${field.name}?: ${nullPrefix}${targetWhere};`);
        }
      }
    } else if (field.type === 'object' && field.objectInfo) {
      // Object fields get nested object where type
      const objectWhere = `${field.objectInfo.objectName}Where`;
      // @flexible fields allow filtering on unknown keys via index signature
      const flexSuffix = field.isFlexible ? ' & { [key: string]: any }' : '';

      if (field.isArray) {
        // Array of objects: some/every/none operators
        if (jsDoc) fields.push(jsDoc);
        fields.push(
          `  ${field.name}?: { some?: ${objectWhere}${flexSuffix}; every?: ${objectWhere}${flexSuffix}; none?: ${objectWhere}${flexSuffix}; };`,
        );
      } else {
        // Single object - object fields don't support null, only NONE (absent)
        if (jsDoc) fields.push(jsDoc);
        fields.push(`  ${field.name}?: ${objectWhere}${flexSuffix};`);
      }
    } else if (field.type === 'tuple' && field.tupleInfo) {
      // Tuple fields get nested tuple where type
      const tupleWhere = `${field.tupleInfo.tupleName}Where`;

      if (field.isArray) {
        // Array of tuples: some/every/none operators
        if (jsDoc) fields.push(jsDoc);
        fields.push(`  ${field.name}?: { some?: ${tupleWhere}; every?: ${tupleWhere}; none?: ${tupleWhere}; };`);
      } else {
        // Single tuple - tuple fields don't support null, only NONE (absent)
        if (jsDoc) fields.push(jsDoc);
        fields.push(`  ${field.name}?: ${tupleWhere};`);
      }
    } else if (field.type === 'literal' && field.literalInfo) {
      // Literal/enum fields get literal/enum where type
      const typeName = getLiteralTypeName(field.literalInfo);
      const whereName = getLiteralWhereName(field.literalInfo);
      const nullPrefix = field.isNullable ? 'null | ' : '';

      if (field.isArray) {
        if (jsDoc) fields.push(jsDoc);
        fields.push(
          `  ${field.name}?: { has?: ${typeName}; hasAll?: ${typeName}[]; hasAny?: ${typeName}[]; isEmpty?: boolean; };`,
        );
      } else {
        if (jsDoc) fields.push(jsDoc);
        fields.push(`  ${field.name}?: ${nullPrefix}${typeName} | ${whereName};`);
      }
    } else {
      const whereType = generateFieldWhereType(field, registry);
      if (whereType) {
        if (jsDoc) fields.push(jsDoc);
        fields.push(`  ${field.name}?: ${whereType};`);
      }
    }
  }

  return `export interface ${model.name}Where {
${fields.join('\n')}
  AND?: ${model.name}Where[];
  OR?: ${model.name}Where[];
  NOT?: ${model.name}Where;
}`;
}

/** Generate WhereInput (stricter version) */
export function generateWhereInputInterface(model: ModelMetadata): string {
  return `export type ${model.name}WhereInput = ${model.name}Where;`;
}

/** Generate all where types for models */
export function generateWhereTypes(models: ModelMetadata[], registry?: ModelRegistry): string {
  const parts: string[] = [];

  for (const model of models) {
    parts.push(generateWhereInterface(model, registry));
    parts.push(generateWhereInputInterface(model));
  }

  return parts.join('\n\n');
}

// Object where type generation has been moved to ./objects/where-generator.ts
export { generateObjectWhereInterface, generateObjectWhereTypes } from './objects/where-generator';
