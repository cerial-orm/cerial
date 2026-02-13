/**
 * Tuple where type generator - generates Where types for tuple definitions
 *
 * Generates filter types for querying tuple elements using both name-based
 * and index-based keys. SurrealDB translates these to field[N] access.
 *
 * Example for `tuple Coordinate { lat Float, lng Float }`:
 * ```ts
 * export interface CoordinateWhere {
 *   0?: number | { gt?: number; ... };
 *   lat?: number | { gt?: number; ... };
 *   1?: number | { gt?: number; ... };
 *   lng?: number | { gt?: number; ... };
 * }
 * ```
 */

import type { ObjectRegistry, TupleElementMetadata, TupleMetadata, TupleRegistry } from '../../../types';
import { generateFieldWhereType } from '../where-generator';

/**
 * Generate the where type for a single tuple element.
 * Creates a synthetic FieldMetadata to reuse the existing generateFieldWhereType.
 */
function generateElementWhereType(element: TupleElementMetadata): string {
  // For object-typed elements, reference the object's Where type
  if (element.type === 'object' && element.objectInfo) {
    return `${element.objectInfo.objectName}Where`;
  }

  // For tuple-typed elements, reference the nested tuple's Where type
  if (element.type === 'tuple' && element.tupleInfo) {
    return `${element.tupleInfo.tupleName}Where`;
  }

  // Create a synthetic FieldMetadata for primitive elements
  const syntheticField = {
    name: element.name ?? `${element.index}`,
    type: element.type,
    isId: false,
    isUnique: false,
    isRequired: !element.isOptional,
  };

  return generateFieldWhereType(syntheticField);
}

/** Generate Where interface for a tuple definition */
export function generateTupleWhereInterface(
  tuple: TupleMetadata,
  _tupleRegistry?: TupleRegistry,
  _objectRegistry?: ObjectRegistry,
): string {
  const fields: string[] = [];

  for (const element of tuple.elements) {
    const whereType = generateElementWhereType(element);
    if (!whereType) continue;

    // Index-based key (always available)
    fields.push(`  ${element.index}?: ${whereType};`);

    // Named key (if the element has a name)
    if (element.name) {
      fields.push(`  ${element.name}?: ${whereType};`);
    }
  }

  return `export interface ${tuple.name}Where {
${fields.join('\n')}
}`;
}

/** Generate Where types for all tuples */
export function generateTupleWhereTypes(
  tuples: TupleMetadata[],
  tupleRegistry?: TupleRegistry,
  objectRegistry?: ObjectRegistry,
): string {
  if (!tuples.length) return '';

  return tuples.map((t) => generateTupleWhereInterface(t, tupleRegistry, objectRegistry)).join('\n\n');
}
