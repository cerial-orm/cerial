/**
 * Tuple interface generator - generates TypeScript types for tuple definitions
 *
 * Generates two types for each tuple:
 * - Output type (Coordinate): TypeScript tuple literal [float, float] — always returned as array
 * - Input type (CoordinateInput): Union of tuple literal OR object form with named/index keys
 */

import type { ObjectRegistry, TupleElementMetadata, TupleMetadata, TupleRegistry } from '../../../types';
import { schemaTypeToTsType } from '../../../utils/type-utils';

/**
 * Get the TypeScript output type for a tuple element
 * Objects use their interface name, nested tuples use their output type, primitives use TS type
 */
function getElementOutputType(element: TupleElementMetadata): string {
  if (element.type === 'object' && element.objectInfo) return element.objectInfo.objectName;
  if (element.type === 'tuple' && element.tupleInfo) return element.tupleInfo.tupleName;

  return schemaTypeToTsType(element.type);
}

/**
 * Get the TypeScript input type for a tuple element
 * Objects use their Input interface, nested tuples use their Input type, primitives use TS type
 */
function getElementInputType(element: TupleElementMetadata): string {
  if (element.type === 'object' && element.objectInfo) return `${element.objectInfo.objectName}Input`;
  if (element.type === 'tuple' && element.tupleInfo) return `${element.tupleInfo.tupleName}Input`;

  return schemaTypeToTsType(element.type);
}

/**
 * Wrap an element type with optional marker if the element is optional
 * Optional elements produce `T | null` in the output tuple
 */
function wrapOptional(type: string, isOptional: boolean): string {
  if (!isOptional) return type;

  return `${type} | null`;
}

/** Generate the output tuple type (TypeScript tuple literal) */
export function generateTupleOutputType(tuple: TupleMetadata): string {
  const elements = tuple.elements
    .map((e) => {
      const type = getElementOutputType(e);

      return wrapOptional(type, e.isOptional);
    })
    .join(', ');

  return `[${elements}]`;
}

/** Generate the input tuple type as array literal */
function generateTupleInputArrayType(tuple: TupleMetadata): string {
  const elements = tuple.elements
    .map((e) => {
      const type = getElementInputType(e);

      return wrapOptional(type, e.isOptional);
    })
    .join(', ');

  return `[${elements}]`;
}

/**
 * Generate the input object form for a tuple
 * Users can pass { lat: 1.5, lng: 2.5 } or { 0: 1.5, 1: 2.5 } or mixed
 * All named keys and index keys are optional — but the total must match the tuple length
 */
function generateTupleInputObjectType(tuple: TupleMetadata): string {
  const fields: string[] = [];

  for (const element of tuple.elements) {
    const inputType = getElementInputType(element);
    const type = wrapOptional(inputType, element.isOptional);

    // Index-based key (always available)
    fields.push(`  ${element.index}?: ${type};`);

    // Named key (if the element has a name)
    if (element.name) {
      fields.push(`  ${element.name}?: ${type};`);
    }
  }

  return `{\n${fields.join('\n')}\n}`;
}

/**
 * Check if a tuple has any named elements
 * Only tuples with named elements need the object input form
 */
export function tupleHasNamedElements(tuple: TupleMetadata): boolean {
  return tuple.elements.some((e) => e.name !== undefined);
}

/**
 * Check if a tuple has any object-typed elements (determines import needs)
 */
export function tupleHasObjectElements(
  tuple: TupleMetadata,
  _objectRegistry?: ObjectRegistry,
  visited: Set<string> = new Set(),
): boolean {
  for (const element of tuple.elements) {
    if (element.type === 'object') return true;
    if (element.type === 'tuple' && element.tupleInfo) {
      const nestedName = element.tupleInfo.tupleName;
      if (visited.has(nestedName)) continue;
      // Nested tuple might have objects — but we don't need to recurse,
      // as the nested tuple's own file handles its own imports
    }
  }

  return false;
}

/**
 * Check if a tuple has any nested tuple elements (determines import needs)
 */
export function tupleHasTupleElements(tuple: TupleMetadata): boolean {
  return tuple.elements.some((e) => e.type === 'tuple' && e.tupleInfo);
}

/** Generate output type alias for a tuple definition */
export function generateTupleInterface(tuple: TupleMetadata): string {
  const outputType = generateTupleOutputType(tuple);

  return `export type ${tuple.name} = ${outputType};`;
}

/** Generate input type alias for a tuple definition (union of array and object form) */
export function generateTupleInputInterface(tuple: TupleMetadata): string {
  const arrayType = generateTupleInputArrayType(tuple);

  // If tuple has named elements, also allow object form
  if (tupleHasNamedElements(tuple)) {
    const objectType = generateTupleInputObjectType(tuple);

    return `export type ${tuple.name}Input = ${arrayType} | ${objectType};`;
  }

  // Index-only tuples: array form or object with numeric keys
  const objectType = generateTupleInputObjectType(tuple);

  return `export type ${tuple.name}Input = ${arrayType} | ${objectType};`;
}

/** Generate interfaces for all tuples (output and input) */
export function generateTupleInterfaces(
  tuples: TupleMetadata[],
  _tupleRegistry?: TupleRegistry,
  _objectRegistry?: ObjectRegistry,
): string {
  if (!tuples.length) return '';

  const interfaces: string[] = [];
  for (const tuple of tuples) {
    interfaces.push(generateTupleInterface(tuple));
    interfaces.push(generateTupleInputInterface(tuple));
  }

  return interfaces.join('\n\n');
}
