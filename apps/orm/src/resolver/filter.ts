/**
 * Shared pick/omit filtering functions for extends resolution.
 *
 * Each function accepts the parent's items and an ExtendsFilter,
 * returning a new filtered array without mutating the original.
 * Throws descriptive errors when filter references nonexistent items.
 */

import type { ASTField, ASTLiteralVariant, ASTTupleElement, ExtendsFilter } from '../types';

/**
 * Get the string identity of a literal variant for filter matching.
 * - String variants: `'value'` (with quotes)
 * - Int/float variants: numeric string representation
 * - Bool variants: `'true'` or `'false'`
 * - Broad types: typeName (e.g., `'Int'`, `'String'`)
 * - Object/tuple/literal refs: the ref name
 */
function getVariantIdentity(variant: ASTLiteralVariant): string {
  switch (variant.kind) {
    case 'string':
      return `'${variant.value}'`;
    case 'int':
    case 'float':
      return String(variant.value);
    case 'bool':
      return String(variant.value);
    case 'broadType':
      return variant.typeName;
    case 'objectRef':
      return variant.objectName;
    case 'tupleRef':
      return variant.tupleName;
    case 'literalRef':
      return variant.literalName;
  }
}

/**
 * Resolve a tuple element reference to an index.
 * Named elements match by name; string-integer references match by position index.
 * Returns -1 if not found.
 */
function resolveElementIndex(elements: ASTTupleElement[], ref: string): number {
  // Try name match first
  const nameIdx = elements.findIndex((e) => e.name === ref);
  if (nameIdx !== -1) return nameIdx;

  // Try index match (string that parses to a non-negative integer)
  const parsed = Number(ref);
  if (Number.isInteger(parsed) && parsed >= 0 && parsed < elements.length) return parsed;

  return -1;
}

/**
 * Validate that all filter references exist in the available set.
 * Throws a descriptive error on the first nonexistent reference.
 */
function validateReferences(
  filterFields: string[],
  availableSet: Set<string>,
  parentName: string,
  itemKind: string,
): void {
  for (const ref of filterFields) {
    if (!availableSet.has(ref)) {
      throw new Error(
        `${itemKind} filter references nonexistent ${itemKind.toLowerCase()} '${ref}' in parent '${parentName}'`,
      );
    }
  }
}

/**
 * Apply pick/omit filtering to model or object fields.
 *
 * - Pick: return only fields whose names are in `filter.fields`
 * - Omit: return all fields except those in `filter.fields`
 * - Throws if any referenced field doesn't exist in the parent
 * - Private fields CAN be freely picked or omitted (no enforcement)
 */
export function applyFieldFilter(fields: ASTField[], filter: ExtendsFilter, parentName: string): ASTField[] {
  const fieldNames = new Set(fields.map((f) => f.name));
  validateReferences(filter.fields, fieldNames, parentName, 'Field');

  const filterSet = new Set(filter.fields);

  if (filter.mode === 'pick') {
    return fields.filter((f) => filterSet.has(f.name));
  }

  return fields.filter((f) => !filterSet.has(f.name));
}

/**
 * Apply pick/omit filtering to tuple elements.
 *
 * Elements can be referenced by name (for named elements) or by index as string ("0", "1").
 * Throws if any referenced element doesn't exist.
 */
export function applyElementFilter(
  elements: ASTTupleElement[],
  filter: ExtendsFilter,
  parentName: string,
): ASTTupleElement[] {
  // Resolve all references to indices first, validating each
  const resolvedIndices = new Set<number>();
  for (const ref of filter.fields) {
    const idx = resolveElementIndex(elements, ref);
    if (idx === -1) {
      throw new Error(`Element filter references nonexistent element '${ref}' in parent '${parentName}'`);
    }
    resolvedIndices.add(idx);
  }

  if (filter.mode === 'pick') {
    return elements.filter((_, i) => resolvedIndices.has(i));
  }

  return elements.filter((_, i) => !resolvedIndices.has(i));
}

/**
 * Apply pick/omit filtering to enum values.
 *
 * - Pick: return only values in filter.fields
 * - Omit: return all values except those in filter.fields
 * - Throws if any referenced value doesn't exist
 */
export function applyValueFilter(values: string[], filter: ExtendsFilter, parentName: string): string[] {
  const valueSet = new Set(values);
  validateReferences(filter.fields, valueSet, parentName, 'Value');

  const filterSet = new Set(filter.fields);

  if (filter.mode === 'pick') {
    return values.filter((v) => filterSet.has(v));
  }

  return values.filter((v) => !filterSet.has(v));
}

/**
 * Apply pick/omit filtering to literal variants.
 *
 * Variants are matched by their string identity:
 * - String variants: `'active'` (quoted)
 * - Int/float: numeric string (e.g., `'42'`, `'3.14'`)
 * - Bool: `'true'` or `'false'`
 * - Broad types: type name (e.g., `'Int'`, `'String'`)
 * - Object/tuple/literal refs: ref name (e.g., `'Address'`, `'Coord'`)
 *
 * Throws if any referenced variant doesn't exist.
 */
export function applyVariantFilter(
  variants: ASTLiteralVariant[],
  filter: ExtendsFilter,
  parentName: string,
): ASTLiteralVariant[] {
  const identityMap = new Map<string, number[]>();
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    if (!variant) continue;
    const id = getVariantIdentity(variant);
    const existing = identityMap.get(id);
    if (existing) {
      existing.push(i);
    } else {
      identityMap.set(id, [i]);
    }
  }

  // Validate all references exist
  for (const ref of filter.fields) {
    if (!identityMap.has(ref)) {
      throw new Error(`Variant filter references nonexistent variant '${ref}' in parent '${parentName}'`);
    }
  }

  const filterSet = new Set(filter.fields);

  if (filter.mode === 'pick') {
    return variants.filter((v) => filterSet.has(getVariantIdentity(v)));
  }

  return variants.filter((v) => !filterSet.has(getVariantIdentity(v)));
}
