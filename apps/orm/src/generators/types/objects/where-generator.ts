/**
 * Object where type generator - generates Where types for object definitions
 *
 * Generates filter types for querying nested object fields using operators
 * (equals, contains, startsWith, etc.) and logical operators (AND, OR, NOT).
 */

import type { FieldMetadata, ModelMetadata, ObjectMetadata, ObjectRegistry } from '../../../types';
import { getLiteralTypeName, getLiteralWhereName } from '../enums';
import { generateArrayFieldOps, generateFieldWhereType } from '../where-generator';

/**
 * Names of the objects whose instances can be absent: an object used through an optional single
 * field, or nested under such an object through single fields. Their array sub-fields get `isNone`.
 * An object's Where type is shared by every use, so one optional use is enough.
 */
export function collectAbsentObjects(
  models: readonly ModelMetadata[],
  objectRegistry: ObjectRegistry,
): ReadonlySet<string> {
  const absent = new Set<string>();
  const mark = (fields: readonly FieldMetadata[], parentAbsent: boolean): void => {
    for (const field of fields) {
      if (field.type !== 'object' || field.isArray || !field.objectInfo) continue;
      if (field.isRequired && !parentAbsent) continue;
      absent.add(field.objectInfo.objectName);
    }
  };

  for (const model of models) mark(model.fields, false);
  // Absence propagates down through single object fields, so repeat until nothing new is added.
  let size = -1;
  while (size !== absent.size) {
    size = absent.size;
    for (const object of Object.values(objectRegistry)) mark(object.fields, absent.has(object.name));
  }

  return absent;
}

/** Generate Where interface for an object definition */
export function generateObjectWhereInterface(
  object: ObjectMetadata,
  _objectRegistry?: ObjectRegistry,
  absentObjects?: ReadonlySet<string>,
): string {
  const canBeAbsent = absentObjects?.has(object.name) ?? false;
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
        fields.push(`  ${field.name}?: ${generateArrayFieldOps(typeName, canBeAbsent)};`);
      } else {
        fields.push(`  ${field.name}?: ${nullPrefix}${typeName} | ${whereName};`);
      }
    } else {
      const whereType = generateFieldWhereType(field, undefined, canBeAbsent);
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
