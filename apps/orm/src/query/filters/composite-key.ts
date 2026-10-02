/**
 * Composite unique key lookup and expansion.
 *
 * Lives beside the condition builder because buildConditions expands a composite key wherever it
 * appears, including inside AND/OR/NOT, so no builder can compile one into zero conditions.
 */

import type { ModelMetadata, WhereClause } from '../../types';

/**
 * Check if a composite unique key is present in the where clause.
 * A composite key is present when the where clause has a property matching
 * a @@unique directive name, with an object value containing the composite fields.
 */
export function findCompositeUniqueKey(
  where: WhereClause,
  model: ModelMetadata,
): { name: string; fields: string[]; values: Record<string, unknown> } | null {
  const compositeUniques = (model.compositeDirectives ?? []).filter((d) => d.kind === 'unique');

  for (const directive of compositeUniques) {
    const compositeValue = where[directive.name];
    if (compositeValue && typeof compositeValue === 'object' && !Array.isArray(compositeValue)) {
      return {
        name: directive.name,
        fields: directive.fields,
        values: compositeValue as Record<string, unknown>,
      };
    }
  }

  return null;
}

/**
 * The condition builder skips an undefined value, so a missing part would silently narrow nothing and a
 * unique-key DELETE or UPDATE would run unconditionally. validateWhere rejects this first; the check
 * stays because this is the last place the part is still known by name.
 */
function assertCompositePart(directiveName: string, fieldRef: string, value: unknown): void {
  if (value === undefined) throw new Error(`Composite key '${directiveName}' is missing a value for '${fieldRef}'`);
}

/**
 * Expand composite unique keys in a where clause into flat field conditions.
 * Removes the composite key name from the where clause and injects the individual fields.
 *
 * For example: { compositeKeyName: { field1: 'a', field2: 'b' }, isActive: true }
 * Becomes:     { field1: 'a', field2: 'b', isActive: true }
 *
 * For dot-notation fields (address.city), the nested structure is preserved:
 * { compositeKeyName: { address: { city: 'NYC' }, name: 'Alice' } }
 * Becomes: { 'address.city': 'NYC', name: 'Alice' }
 */
export function expandCompositeKey(where: WhereClause, model: ModelMetadata): WhereClause {
  const composite = findCompositeUniqueKey(where, model);
  if (!composite) return where;

  // Remove the composite key name from the where clause
  const expanded: WhereClause = { ...where };
  delete expanded[composite.name];

  // Flatten the composite key values into dot-notation fields
  const directive = (model.compositeDirectives ?? []).find((d) => d.name === composite.name);
  if (!directive) return expanded;

  for (const fieldRef of directive.fields) {
    const parts = fieldRef.split('.');

    if (parts.length === 1) {
      // Simple field: extract directly from composite values
      expanded[fieldRef] = composite.values[fieldRef];
      assertCompositePart(directive.name, fieldRef, expanded[fieldRef]);
    } else {
      // Dot-notation field: extract from nested structure
      // e.g., for "address.city", walk composite.values.address.city
      let current: unknown = composite.values;
      for (const part of parts) {
        if (current && typeof current === 'object' && !Array.isArray(current)) {
          current = (current as Record<string, unknown>)[part];
        } else {
          current = undefined;
          break;
        }
      }
      // Store with dot notation key — the condition builder will handle it
      expanded[fieldRef] = current;
      assertCompositePart(directive.name, fieldRef, current);
    }
  }

  return expanded;
}

/** Expand every composite key in a where clause; a clause can name more than one directive. */
export function expandCompositeKeys(where: WhereClause, model: ModelMetadata): WhereClause {
  let expanded = where;
  while (findCompositeUniqueKey(expanded, model)) expanded = expandCompositeKey(expanded, model);

  return expanded;
}
