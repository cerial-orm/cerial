/**
 * Tuple update type generator - generates per-element update types for tuples
 *
 * Generates an Update type for each tuple that allows updating individual elements
 * without replacing the entire tuple. Uses `{ update: TupleUpdate }` wrapper to
 * distinguish from full-replace object form input.
 *
 * Example for `tuple Coordinate { lat Float, lng Float }`:
 * ```ts
 * export type CoordinateUpdate = {
 *   lat?: number;
 *   0?: number;
 *   lng?: number;
 *   1?: number;
 * };
 * ```
 *
 * Object elements get merge semantics (Partial | { set: ... }), nested tuples
 * get recursive per-element update ({ update: InnerUpdate }).
 */

import type { TupleElementMetadata, TupleMetadata } from '../../../types';
import { schemaTypeToTsType } from '../../../utils/type-utils';

/**
 * Get the input type name for a tuple element in update context.
 * Objects use their Input interface, nested tuples use their Input type.
 */
function getElementInputType(element: TupleElementMetadata): string {
  if (element.type === 'object' && element.objectInfo) return `${element.objectInfo.objectName}Input`;
  if (element.type === 'tuple' && element.tupleInfo) return `${element.tupleInfo.tupleName}Input`;

  return schemaTypeToTsType(element.type);
}

/**
 * Get the update value type for a single tuple element.
 *
 * - Primitive: just the TS type
 * - Object: Partial<ObjInput> | { set: ObjInput } (merge or full replace)
 * - Nested tuple: TupleInput | { update: TupleUpdate } (full replace or per-element)
 *
 * Optional elements add | CerialNone, nullable elements add | null.
 */
function getElementUpdateType(element: TupleElementMetadata): string {
  let baseType: string;

  if (element.type === 'object' && element.objectInfo) {
    const inputName = `${element.objectInfo.objectName}Input`;
    baseType = `Partial<${inputName}> | { set: ${inputName} }`;
  } else if (element.type === 'tuple' && element.tupleInfo) {
    const inputName = `${element.tupleInfo.tupleName}Input`;
    const updateName = `${element.tupleInfo.tupleName}Update`;
    baseType = `${inputName} | { update: ${updateName} }`;
  } else {
    baseType = schemaTypeToTsType(element.type);
  }

  // Add nullable/optional modifiers
  if (element.isNullable && element.isOptional) return `${baseType} | null | CerialNone`;
  if (element.isNullable) return `${baseType} | null`;
  if (element.isOptional) return `${baseType} | CerialNone`;

  return baseType;
}

/** Generate the Update type for a single tuple */
export function generateTupleUpdateType(tuple: TupleMetadata): string {
  const fields: string[] = [];

  for (const element of tuple.elements) {
    const updateType = getElementUpdateType(element);

    // Index-based key (always available)
    fields.push(`  ${element.index}?: ${updateType};`);

    // Named key (if the element has a name)
    if (element.name) {
      fields.push(`  ${element.name}?: ${updateType};`);
    }
  }

  return `export type ${tuple.name}Update = {\n${fields.join('\n')}\n};`;
}

/** Generate Update types for all tuples */
export function generateAllTupleUpdateTypes(tuples: TupleMetadata[]): string {
  if (!tuples.length) return '';

  return tuples.map((t) => generateTupleUpdateType(t)).join('\n\n');
}
