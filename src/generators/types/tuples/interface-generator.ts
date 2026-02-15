/**
 * Tuple interface generator - generates TypeScript types for tuple definitions
 *
 * Generates two types for each tuple:
 * - Output type (Coordinate): TypeScript tuple literal [float, float] — always returned as array
 * - Input type (CoordinateInput): Union of tuple literal OR object form with named/index keys
 */

import type { ObjectRegistry, TupleElementMetadata, TupleMetadata, TupleRegistry } from '../../../types';
import { schemaTypeToTsType } from '../../../utils/type-utils';
import { getLiteralTypeName } from '../enums';
import { literalNeedsInputType } from '../literals';

/**
 * Get the TypeScript output type for a tuple element
 * Objects use their interface name, nested tuples use their output type, primitives use TS type
 */
function getElementOutputType(element: TupleElementMetadata): string {
  if (element.type === 'uuid') return 'CerialUuid';
  if (element.type === 'duration') return 'CerialDuration';
  if (element.type === 'decimal') return 'CerialDecimal';
  if (element.type === 'bytes') return 'CerialBytes';
  if (element.type === 'geometry') return 'CerialGeometry';
  if (element.type === 'object' && element.objectInfo) return element.objectInfo.objectName;
  if (element.type === 'tuple' && element.tupleInfo) return element.tupleInfo.tupleName;
  if (element.type === 'literal' && element.literalInfo) return getLiteralTypeName(element.literalInfo);

  return schemaTypeToTsType(element.type);
}

/**
 * Get the TypeScript input type for a tuple element
 * Objects use their Input interface, nested tuples use their Input type,
 * literals use Input variant when has tuple/object refs, primitives use TS type
 */
function getElementInputType(element: TupleElementMetadata): string {
  if (element.type === 'uuid') return 'CerialUuidInput';
  if (element.type === 'duration') return 'CerialDurationInput';
  if (element.type === 'decimal') return 'CerialDecimalInput';
  if (element.type === 'bytes') return 'CerialBytesInput';
  if (element.type === 'geometry') return 'CerialGeometryInput';
  if (element.type === 'object' && element.objectInfo) return `${element.objectInfo.objectName}Input`;
  if (element.type === 'tuple' && element.tupleInfo) return `${element.tupleInfo.tupleName}Input`;
  if (element.type === 'literal' && element.literalInfo) {
    const lit = element.literalInfo;
    if (lit.isEnum) return getLiteralTypeName(lit);
    if (literalNeedsInputType({ name: lit.literalName, variants: lit.variants })) return `${lit.literalName}Input`;

    return lit.literalName;
  }

  return schemaTypeToTsType(element.type);
}

/**
 * Wrap an element type with null union if the element is optional or nullable
 * Optional elements produce `T | null` in the output tuple (SurrealDB returns null for absent positions)
 * @nullable elements also produce `T | null` (the element can hold null as a value)
 */
function wrapNullable(type: string, isOptional: boolean, isNullable?: boolean): string {
  if (!isOptional && !isNullable) return type;

  return `${type} | null`;
}

/** Generate the output tuple type (TypeScript tuple literal) */
export function generateTupleOutputType(tuple: TupleMetadata): string {
  const elements = tuple.elements
    .map((e) => {
      const type = getElementOutputType(e);

      return wrapNullable(type, e.isOptional, e.isNullable);
    })
    .join(', ');

  return `[${elements}]`;
}

/** Generate the input tuple type as array literal */
function generateTupleInputArrayType(tuple: TupleMetadata): string {
  const elements = tuple.elements
    .map((e) => {
      const type = getElementInputType(e);

      return wrapNullable(type, e.isOptional, e.isNullable);
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
    const type = wrapNullable(inputType, element.isOptional, element.isNullable);

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
 * Check if a tuple has object elements at any nesting depth (through nested tuples).
 * Used for determining whether to generate a TupleSelect type.
 * Unlike tupleHasObjectElements (which only checks direct elements for import needs),
 * this recurses into nested tuples to find objects at any depth.
 */
export function tupleHasObjectElementsDeep(tuple: TupleMetadata, visited: Set<string> = new Set()): boolean {
  if (visited.has(tuple.name)) return false;
  visited.add(tuple.name);

  for (const element of tuple.elements) {
    if (element.type === 'object') return true;
    if (element.type === 'tuple' && element.tupleInfo) {
      const nestedTuple: TupleMetadata = {
        name: element.tupleInfo.tupleName,
        elements: element.tupleInfo.elements,
      };
      if (tupleHasObjectElementsDeep(nestedTuple, visited)) return true;
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
