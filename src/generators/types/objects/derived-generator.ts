/**
 * Object derived type generator - generates Select and OrderBy types for objects
 *
 * These types enable field selection and ordering on nested object fields
 * in queries.
 */

import type { FieldMetadata, ObjectMetadata } from '../../../types';

/** Get the select type for a field (boolean for primitives, boolean | ObjectSelect for objects) */
function getFieldSelectType(field: FieldMetadata): string {
  if (field.type === 'object' && field.objectInfo) return `boolean | ${field.objectInfo.objectName}Select`;

  return 'boolean';
}

/** Generate Select type for an object definition */
export function generateObjectSelectType(object: ObjectMetadata): string {
  const fields = object.fields;

  if (fields.length === 0) {
    return `export interface ${object.name}Select {}`;
  }

  if (fields.length === 1) {
    const f = fields[0]!;
    const selectType = getFieldSelectType(f);

    return `export type ${object.name}Select = { ${f.name}: ${selectType}; };`;
  }

  // Generate union where each variant requires at least one field
  const variants = fields.map((field) => {
    const selectType = getFieldSelectType(field);
    const otherFields = fields.filter((f) => f.name !== field.name);
    const hasObjectOthers = otherFields.some((f) => f.type === 'object' && f.objectInfo);

    if (hasObjectOthers) {
      const otherFieldDefs = otherFields.map((f) => `${f.name}?: ${getFieldSelectType(f)}`).join('; ');

      return `  | { ${field.name}: ${selectType} } & { ${otherFieldDefs} }`;
    }

    const otherKeys = otherFields.map((f) => `'${f.name}'`).join(' | ');

    return `  | { ${field.name}: ${selectType} } & Partial<Record<${otherKeys}, boolean>>`;
  });

  return `export type ${object.name}Select =
${variants.join('\n')};`;
}

/** Generate OrderBy type for an object definition */
export function generateObjectOrderByType(object: ObjectMetadata): string {
  const fields: string[] = [];

  for (const field of object.fields) {
    if (field.type === 'object' && field.objectInfo) {
      fields.push(`  ${field.name}?: ${field.objectInfo.objectName}OrderBy;`);
    } else {
      fields.push(`  ${field.name}?: 'asc' | 'desc';`);
    }
  }

  return `export interface ${object.name}OrderBy {
${fields.join('\n')}
}`;
}

/** Generate all derived types for an object */
export function generateObjectDerivedTypes(object: ObjectMetadata): string {
  const types = [generateObjectSelectType(object), generateObjectOrderByType(object)];

  return types.join('\n\n');
}

/** Generate all object derived types */
export function generateAllObjectDerivedTypes(objects: ObjectMetadata[]): string {
  if (!objects.length) return '';

  return objects.map((obj) => generateObjectDerivedTypes(obj)).join('\n\n');
}
