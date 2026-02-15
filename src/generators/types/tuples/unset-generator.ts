/**
 * Tuple unset type generator - generates per-element unset types for tuples
 *
 * Generates an Unset type for each tuple that has optional elements or
 * required elements with optional children. Only optional elements can
 * be directly unset (set to NONE). Required object/tuple elements with
 * optional children get sub-field structure without `true`.
 *
 * Example for `tuple MetaCoord { lat Float, lng Float, altitude Float? }`:
 * ```ts
 * export type MetaCoordUnset = {
 *   2?: true;
 *   altitude?: true;
 * };
 * ```
 */

import type { ObjectFieldMetadata, TupleElementMetadata, TupleMetadata } from '../../../types';

/**
 * Generate inline object unset fields for an object within a tuple element.
 * Returns field definitions for optional sub-fields.
 */
function generateInlineObjectUnsetFields(objectInfo: ObjectFieldMetadata, indent: string = '    '): string[] {
  const fields: string[] = [];

  for (const field of objectInfo.fields) {
    // Skip readonly, relations, id, @now
    if (field.isReadonly || field.type === 'relation' || field.isId) continue;
    if (field.timestampDecorator === 'now') continue;

    const isOptional = !field.isRequired;

    if (field.type === 'object' && field.objectInfo) {
      const children = generateInlineObjectUnsetFields(field.objectInfo, indent + '  ');
      const hasOptionalChildren = children.length > 0;

      if (isOptional && hasOptionalChildren) {
        fields.push(`${indent}${field.name}?: true | {\n${children.join('\n')}\n${indent}};`);
      } else if (isOptional) {
        fields.push(`${indent}${field.name}?: true;`);
      } else if (hasOptionalChildren) {
        fields.push(`${indent}${field.name}?: {\n${children.join('\n')}\n${indent}};`);
      }
    } else if (field.type === 'tuple' && field.tupleInfo) {
      const hasOptionalElements = tupleInfoHasUnsetableElements(field.tupleInfo);
      const tupleName = field.tupleInfo.tupleName;

      if (isOptional && hasOptionalElements) {
        fields.push(`${indent}${field.name}?: true | ${tupleName}Unset;`);
      } else if (isOptional) {
        fields.push(`${indent}${field.name}?: true;`);
      } else if (hasOptionalElements) {
        fields.push(`${indent}${field.name}?: ${tupleName}Unset;`);
      }
    } else if (isOptional) {
      // Primitive/Record — only if optional
      fields.push(`${indent}${field.name}?: true;`);
    }
  }

  return fields;
}

/**
 * Generate the unset entry for a single tuple element.
 * Returns the type string (e.g., 'true', 'true | { ... }', '{ ... }') or null if skipped.
 */
function generateElementUnsetEntry(element: TupleElementMetadata): string | null {
  const canClear = element.isOptional || element.isNullable;

  if (element.type === 'object' && element.objectInfo) {
    const children = generateInlineObjectUnsetFields(element.objectInfo);
    const hasOptionalChildren = children.length > 0;

    if (canClear && hasOptionalChildren) {
      return `true | {\n${children.join('\n')}\n  }`;
    } else if (canClear) {
      return 'true';
    } else if (hasOptionalChildren) {
      return `{\n${children.join('\n')}\n  }`;
    }

    return null;
  }

  if (element.type === 'tuple' && element.tupleInfo) {
    const hasOptionalElements = tupleInfoHasUnsetableElements(element.tupleInfo);
    const tupleName = element.tupleInfo.tupleName;

    if (canClear && hasOptionalElements) {
      return `true | ${tupleName}Unset`;
    } else if (canClear) {
      return 'true';
    } else if (hasOptionalElements) {
      return `${tupleName}Unset`;
    }

    return null;
  }

  if (canClear) return 'true';

  return null;
}

/**
 * Check if a TupleFieldMetadata has any unsetable elements.
 * Used for inline references (model/object fields referencing a tuple).
 */
function tupleInfoHasUnsetableElements(tupleInfo: { elements: TupleElementMetadata[] }): boolean {
  for (const element of tupleInfo.elements) {
    if (generateElementUnsetEntry(element) !== null) return true;
  }

  return false;
}

/** Check if a tuple has any unsetable elements */
export function tupleHasUnsetableElements(tuple: TupleMetadata): boolean {
  return tupleInfoHasUnsetableElements(tuple);
}

/** Generate the Unset type for a single tuple */
export function generateTupleUnsetType(tuple: TupleMetadata): string {
  const fields: string[] = [];

  for (const element of tuple.elements) {
    const entry = generateElementUnsetEntry(element);
    if (!entry) continue;

    // Index key
    fields.push(`  ${element.index}?: ${entry};`);

    // Named key
    if (element.name) {
      fields.push(`  ${element.name}?: ${entry};`);
    }
  }

  if (!fields.length) return '';

  return `export type ${tuple.name}Unset = {\n${fields.join('\n')}\n};`;
}

/** Generate Unset types for all tuples that need them */
export function generateAllTupleUnsetTypes(tuples: TupleMetadata[]): string {
  const types = tuples.map((t) => generateTupleUnsetType(t)).filter(Boolean);
  if (!types.length) return '';

  return types.join('\n\n');
}
