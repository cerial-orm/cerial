/**
 * Object where type generator - generates Where types for object definitions
 *
 * Generates filter types for querying nested object fields using operators
 * (equals, contains, startsWith, etc.) and logical operators (AND, OR, NOT).
 */

import type { ObjectMetadata, ObjectRegistry } from '../../../types';
import { generateFieldWhereType } from '../where-generator';

/** Generate Where interface for an object definition */
export function generateObjectWhereInterface(object: ObjectMetadata, _objectRegistry?: ObjectRegistry): string {
  const fields: string[] = [];

  for (const field of object.fields) {
    if (field.type === 'object' && field.objectInfo) {
      // Nested object where
      const objectWhere = `${field.objectInfo.objectName}Where`;

      if (field.isArray) {
        fields.push(`  ${field.name}?: { some?: ${objectWhere}; every?: ${objectWhere}; none?: ${objectWhere}; };`);
      } else {
        // Object fields don't support null, only NONE (absent)
        fields.push(`  ${field.name}?: ${objectWhere};`);
      }
    } else {
      const whereType = generateFieldWhereType(field);
      if (whereType) {
        fields.push(`  ${field.name}?: ${whereType};`);
      }
    }
  }

  return `export interface ${object.name}Where {
${fields.join('\n')}
  AND?: ${object.name}Where[];
  OR?: ${object.name}Where[];
  NOT?: ${object.name}Where;
}`;
}

/** Generate Where types for all objects */
export function generateObjectWhereTypes(objects: ObjectMetadata[], objectRegistry?: ObjectRegistry): string {
  if (!objects.length) return '';

  return objects.map((obj) => generateObjectWhereInterface(obj, objectRegistry)).join('\n\n');
}
