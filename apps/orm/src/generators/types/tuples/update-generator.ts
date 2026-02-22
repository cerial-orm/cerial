/**
 * Tuple update type generator - generates per-element update types for tuples
 *
 * Generates an Update type for each tuple that allows updating individual elements
 * without replacing the entire tuple. At all levels (model and nested), array/object
 * disambiguation determines the operation: array = full replace, object = per-element update.
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
 * get array-form for full replace or TupleUpdate for per-element.
 */

import type { TupleElementMetadata, TupleFieldMetadata, TupleMetadata } from '../../../types';
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
 * Generate the array-form-only type for a nested tuple (e.g., `[string, DeepMidObjInput]`).
 * Used inside TupleUpdate types so that full replace only accepts array form,
 * avoiding ambiguity with per-element update object form.
 */
export function generateTupleArrayForm(tupleInfo: TupleFieldMetadata): string {
  const parts = tupleInfo.elements.map((e) => {
    const type = getElementInputType(e);

    return e.isOptional || e.isNullable ? `${type} | null` : type;
  });

  return `[${parts.join(', ')}]`;
}

/**
 * Get the update value type for a single tuple element.
 *
 * - Primitive: just the TS type
 * - Object: Partial<ObjInput> | { set: ObjInput } (merge or full replace)
 * - Nested tuple: TupleArrayForm | TupleUpdate (array = full replace, object = per-element)
 *
 * Optional elements add | CerialNone, nullable elements add | null.
 */
function getElementUpdateType(element: TupleElementMetadata): string {
  let baseType: string;

  if (element.type === 'object' && element.objectInfo) {
    const inputName = `${element.objectInfo.objectName}Input`;
    baseType = `Partial<${inputName}> | { set: ${inputName} }`;
  } else if (element.type === 'tuple' && element.tupleInfo) {
    const arrayForm = generateTupleArrayForm(element.tupleInfo);
    const updateName = `${element.tupleInfo.tupleName}Update`;
    baseType = `${arrayForm} | ${updateName}`;
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
