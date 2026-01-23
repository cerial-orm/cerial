/**
 * Where type generator - generates where clause types for models
 */

import type { ModelMetadata, FieldMetadata } from '../../types';
import { schemaTypeToTsType } from '../../utils/type-utils';

/** Generate comparison operators for a type */
function generateComparisonOps(tsType: string): string {
  return `{
    eq?: ${tsType};
    neq?: ${tsType};
    gt?: ${tsType};
    gte?: ${tsType};
    lt?: ${tsType};
    lte?: ${tsType};
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

/** Generate special operators for a type */
function generateSpecialOps(tsType: string): string {
  return `{
    isNull?: boolean;
    isDefined?: boolean;
    between?: [${tsType}, ${tsType}];
  }`;
}

/** Generate field where type */
export function generateFieldWhereType(field: FieldMetadata): string {
  const tsType = schemaTypeToTsType(field.type);

  // For string types, include string operators
  if (field.type === 'string' || field.type === 'email') {
    return `${tsType} | (
    ${generateComparisonOps(tsType)} &
    ${generateStringOps()} &
    ${generateArrayOps(tsType)} &
    ${generateSpecialOps(tsType)}
  )`;
  }

  // For other types
  return `${tsType} | (
    ${generateComparisonOps(tsType)} &
    ${generateArrayOps(tsType)} &
    ${generateSpecialOps(tsType)}
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
