/**
 * Object where type generator - generates Where types for object definitions
 *
 * Generates filter types for querying nested object fields using operators
 * (equals, contains, startsWith, etc.) and logical operators (AND, OR, NOT).
 */

import type { ObjectMetadata, ObjectRegistry } from '../../../types';
import { getLiteralTypeName, getLiteralWhereName } from '../enums';
import { generateFieldWhereType } from '../where-generator';

/** Generate Where interface for an object definition */
export function generateObjectWhereInterface(object: ObjectMetadata, _objectRegistry?: ObjectRegistry): string {
  const fields: string[] = [];

  for (const field of object.fields) {
    if (field.type === 'object' && field.objectInfo) {
      // Nested object where
      const objectWhere = `${field.objectInfo.objectName}Where`;
      // @flexible fields allow filtering on unknown keys via index signature
      const flexSuffix = field.isFlexible ? ' & { [key: string]: any }' : '';

      if (field.isArray) {
        fields.push(
          `  ${field.name}?: { some?: ${objectWhere}${flexSuffix}; every?: ${objectWhere}${flexSuffix}; none?: ${objectWhere}${flexSuffix}; };`,
        );
      } else {
        // Object fields don't support null, only NONE (absent)
        fields.push(`  ${field.name}?: ${objectWhere}${flexSuffix};`);
      }
    } else if (field.type === 'tuple' && field.tupleInfo) {
      // Nested tuple where
      const tupleWhere = `${field.tupleInfo.tupleName}Where`;

      if (field.isArray) {
        fields.push(`  ${field.name}?: { some?: ${tupleWhere}; every?: ${tupleWhere}; none?: ${tupleWhere}; };`);
      } else {
        // Tuple fields don't support null, only NONE (absent)
        fields.push(`  ${field.name}?: ${tupleWhere};`);
      }
    } else if (field.type === 'literal' && field.literalInfo) {
      // Literal/enum fields get literal/enum where type
      const typeName = getLiteralTypeName(field.literalInfo);
      const whereName = getLiteralWhereName(field.literalInfo);
      const nullPrefix = field.isNullable ? 'null | ' : '';

      if (field.isArray) {
        fields.push(
          `  ${field.name}?: { has?: ${typeName}; hasAll?: ${typeName}[]; hasAny?: ${typeName}[]; isEmpty?: boolean; };`,
        );
      } else {
        fields.push(`  ${field.name}?: ${nullPrefix}${typeName} | ${whereName};`);
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
