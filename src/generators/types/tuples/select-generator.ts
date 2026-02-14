/**
 * Tuple select type generator - generates Select types for tuples with object elements
 *
 * Only generates a Select type when the tuple contains object elements at any nesting depth.
 * Select types allow narrowing object sub-fields within tuples while always returning
 * the full tuple array structure.
 *
 * Example for `tuple Located { tag String, TupleAddress }`:
 * ```ts
 * export type LocatedSelect = {
 *   1?: boolean | TupleAddressSelect;
 * };
 * ```
 *
 * Primitive elements are NOT included in the select type (they can't be narrowed).
 */

import type { TupleElementMetadata, TupleMetadata } from '../../../types';
import { tupleHasObjectElementsDeep } from './interface-generator';

/**
 * Check if a single element should appear in the select type.
 * Only object elements and tuple elements that contain objects at any depth are selectable.
 */
function isSelectableElement(element: TupleElementMetadata): boolean {
  if (element.type === 'object' && element.objectInfo) return true;
  if (element.type === 'tuple' && element.tupleInfo) {
    const nestedTuple: TupleMetadata = {
      name: element.tupleInfo.tupleName,
      elements: element.tupleInfo.elements,
    };

    return tupleHasObjectElementsDeep(nestedTuple);
  }

  return false;
}

/** Get the select value type for a selectable element */
function getElementSelectType(element: TupleElementMetadata): string {
  if (element.type === 'object' && element.objectInfo) {
    return `boolean | ${element.objectInfo.objectName}Select`;
  }
  if (element.type === 'tuple' && element.tupleInfo) {
    return `boolean | ${element.tupleInfo.tupleName}Select`;
  }

  return 'boolean';
}

/**
 * Generate the Select type for a single tuple.
 * Returns null if the tuple has no object elements at any depth (no select type needed).
 */
export function generateTupleSelectType(tuple: TupleMetadata): string | null {
  if (!tupleHasObjectElementsDeep(tuple)) return null;

  const fields: string[] = [];

  for (const element of tuple.elements) {
    if (!isSelectableElement(element)) continue;

    const selectType = getElementSelectType(element);

    // Index-based key (always available)
    fields.push(`  ${element.index}?: ${selectType};`);

    // Named key (if the element has a name)
    if (element.name) {
      fields.push(`  ${element.name}?: ${selectType};`);
    }
  }

  if (!fields.length) return null;

  return `export type ${tuple.name}Select = {\n${fields.join('\n')}\n};`;
}

/** Generate Select types for all tuples (only those with object elements at any depth) */
export function generateAllTupleSelectTypes(tuples: TupleMetadata[]): string {
  if (!tuples.length) return '';

  const types = tuples.map((t) => generateTupleSelectType(t)).filter(Boolean);
  if (!types.length) return '';

  return types.join('\n\n');
}
