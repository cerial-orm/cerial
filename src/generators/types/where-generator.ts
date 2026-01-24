/**
 * Where type generator - generates where clause types for models
 */

import type { ModelMetadata, FieldMetadata } from '../../types';
import { schemaTypeToTsType } from '../../utils/type-utils';

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
function generateNumericSpecialOps(tsType: string, isRequired: boolean): string {
  if (isRequired) {
    return `{
    between?: [${tsType}, ${tsType}];
  }`;
  }
  return `{
    isNull?: boolean;
    between?: [${tsType}, ${tsType}];
  }`;
}

/** Generate special operators for string types (no between) */
function generateStringSpecialOps(isRequired: boolean): string {
  if (isRequired) {
    return `{}`;
  }
  return `{
    isNull?: boolean;
  }`;
}

/** Generate field where type */
export function generateFieldWhereType(field: FieldMetadata): string {
  const tsType = schemaTypeToTsType(field.type);
  const { isRequired } = field;

  // For numeric types, include all comparison operators and between
  if (field.type === 'int' || field.type === 'float') {
    return `${tsType} | (
    ${generateNumericComparisonOps(tsType)} &
    ${generateArrayOps(tsType)} &
    ${generateNumericSpecialOps(tsType, isRequired)}
  )`;
  }

  // For string types, include string operators (no ordering, no between)
  if (field.type === 'string' || field.type === 'email') {
    return `${tsType} | (
    ${generateStringComparisonOps(tsType)} &
    ${generateStringOps()} &
    ${generateArrayOps(tsType)} &
    ${generateStringSpecialOps(isRequired)}
  )`;
  }

  // For date types, include comparison, array, and between (no string ops)
  if (field.type === 'date') {
    return `${tsType} | (
    ${generateNumericComparisonOps(tsType)} &
    ${generateArrayOps(tsType)} &
    ${generateNumericSpecialOps(tsType, isRequired)}
  )`;
  }

  // For other types (bool, etc.), use basic comparison + array + special (no between)
  return `${tsType} | (
    ${generateStringComparisonOps(tsType)} &
    ${generateArrayOps(tsType)} &
    ${generateStringSpecialOps(isRequired)}
  )`;
}

/** Generate Where interface for a model */
export function generateWhereInterface(model: ModelMetadata): string {
  const fields = model.fields.map((f) => {
    const whereType = generateFieldWhereType(f);
    return `  ${f.name}?: ${whereType};`;
  });

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
export function generateWhereTypes(models: ModelMetadata[]): string {
  const parts: string[] = [];

  for (const model of models) {
    parts.push(generateWhereInterface(model));
    parts.push(generateWhereInputInterface(model));
  }

  return parts.join('\n\n');
}
