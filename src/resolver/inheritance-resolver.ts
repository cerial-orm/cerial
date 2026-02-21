/**
 * Inheritance resolution for all 5 AST type kinds.
 *
 * Resolves extends chains by merging parent items into children,
 * applying pick/omit filters, stripping private markers, and
 * returning a flattened AST with no extends references.
 *
 * Does NOT mutate the input AST — always creates new objects.
 */

import type {
  ASTEnum,
  ASTField,
  ASTLiteral,
  ASTLiteralVariant,
  ASTModel,
  ASTObject,
  ASTTuple,
  ASTTupleElement,
  SchemaAST,
} from '../types';
import { applyElementFilter, applyFieldFilter, applyValueFilter, applyVariantFilter } from './filter';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Get the string identity of a literal variant for deduplication.
 * Must match the identity logic in filter.ts.
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
 * Topological sort for types with extends chains.
 * Returns items ordered so that parents come before children.
 * Assumes no cycles (validator catches those before resolution).
 */
function topologicalSort<T extends { name: string; extends?: string }>(items: readonly T[]): T[] {
  const byName = new Map<string, T>();
  for (const item of items) {
    byName.set(item.name, item);
  }

  const sorted: T[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(item: T): void {
    if (visited.has(item.name)) return;
    if (visiting.has(item.name)) return; // cycle — skip (validator handles)

    visiting.add(item.name);

    if (item.extends) {
      const parent = byName.get(item.extends);
      if (parent) visit(parent);
    }

    visiting.delete(item.name);
    visited.add(item.name);
    sorted.push(item);
  }

  for (const item of items) {
    visit(item);
  }

  return sorted;
}

/**
 * Strip isPrivate from a field, returning a new field object.
 */
function stripFieldPrivate(field: ASTField): ASTField {
  if (!field.isPrivate) return field;
  const { isPrivate: _, ...rest } = field;

  return rest as ASTField;
}

/**
 * Strip isPrivate from a tuple element, returning a new element object.
 */
function stripElementPrivate(element: ASTTupleElement): ASTTupleElement {
  if (!element.isPrivate) return element;
  const { isPrivate: _, ...rest } = element;

  return rest as ASTTupleElement;
}

// ──────────────────────────────────────────────
// Model Resolution
// ──────────────────────────────────────────────

/**
 * Resolve model inheritance chains.
 *
 * For each model with `extends`:
 * 1. Get parent's (already resolved) fields
 * 2. Apply pick/omit filter if present
 * 3. Merge: parent fields first, child fields override by name
 * 4. Strip isPrivate from all fields
 * 5. Strip extends/extendsFilter from model
 * 6. Preserve abstract flag
 */
function resolveModels(models: readonly ASTModel[]): ASTModel[] {
  const sorted = topologicalSort(models);
  const resolved = new Map<string, ASTModel>();

  for (const model of sorted) {
    if (!model.extends) {
      // No inheritance — just strip private from fields
      const cleanFields = model.fields.map(stripFieldPrivate);
      resolved.set(model.name, { ...model, fields: cleanFields });
      continue;
    }

    const parent = resolved.get(model.extends);
    if (!parent) {
      // Parent not found (cross-schema or error) — treat as no extends
      const cleanFields = model.fields.map(stripFieldPrivate);
      resolved.set(model.name, { ...model, fields: cleanFields });
      continue;
    }

    // Get parent fields, apply filter if present
    let parentFields = parent.fields;
    if (model.extendsFilter) {
      parentFields = applyFieldFilter(parentFields, model.extendsFilter, parent.name);
    }

    // Merge: child fields override parent fields by name
    const childFieldNames = new Set(model.fields.map((f) => f.name));
    const mergedFields = [...parentFields.filter((f) => !childFieldNames.has(f.name)), ...model.fields];

    // Strip private from all merged fields
    const cleanFields = mergedFields.map(stripFieldPrivate);

    // Build resolved model without extends/extendsFilter
    const resolvedModel: ASTModel = {
      name: model.name,
      fields: cleanFields,
      range: model.range,
    };

    // Preserve directives (NOT inherited — keep child's own)
    if (model.directives?.length) resolvedModel.directives = model.directives;

    // Preserve abstract flag
    if (model.abstract) resolvedModel.abstract = true;

    resolved.set(model.name, resolvedModel);
  }

  return sorted.map((m) => resolved.get(m.name)!);
}

// ──────────────────────────────────────────────
// Object Resolution
// ──────────────────────────────────────────────

/**
 * Resolve object inheritance chains.
 * Same logic as models but no abstract/directives.
 */
function resolveObjects(objects: readonly ASTObject[]): ASTObject[] {
  const sorted = topologicalSort(objects);
  const resolved = new Map<string, ASTObject>();

  for (const object of sorted) {
    if (!object.extends) {
      const cleanFields = object.fields.map(stripFieldPrivate);
      resolved.set(object.name, { ...object, fields: cleanFields });
      continue;
    }

    const parent = resolved.get(object.extends);
    if (!parent) {
      const cleanFields = object.fields.map(stripFieldPrivate);
      resolved.set(object.name, { ...object, fields: cleanFields });
      continue;
    }

    let parentFields = parent.fields;
    if (object.extendsFilter) {
      parentFields = applyFieldFilter(parentFields, object.extendsFilter, parent.name);
    }

    const childFieldNames = new Set(object.fields.map((f) => f.name));
    const mergedFields = [...parentFields.filter((f) => !childFieldNames.has(f.name)), ...object.fields];
    const cleanFields = mergedFields.map(stripFieldPrivate);

    resolved.set(object.name, {
      name: object.name,
      fields: cleanFields,
      range: object.range,
    });
  }

  return sorted.map((o) => resolved.get(o.name)!);
}

// ──────────────────────────────────────────────
// Tuple Resolution
// ──────────────────────────────────────────────

/**
 * Resolve tuple inheritance chains.
 *
 * Parent elements (after filter) come first, then child elements appended.
 * If a child has a named element matching a parent's named element,
 * the child's element REPLACES the parent's at that position.
 */
function resolveTuples(tuples: readonly ASTTuple[]): ASTTuple[] {
  const sorted = topologicalSort(tuples);
  const resolved = new Map<string, ASTTuple>();

  for (const tuple of sorted) {
    if (!tuple.extends) {
      const cleanElements = tuple.elements.map(stripElementPrivate);
      resolved.set(tuple.name, { ...tuple, elements: cleanElements });
      continue;
    }

    const parent = resolved.get(tuple.extends);
    if (!parent) {
      const cleanElements = tuple.elements.map(stripElementPrivate);
      resolved.set(tuple.name, { ...tuple, elements: cleanElements });
      continue;
    }

    let parentElements = parent.elements;
    if (tuple.extendsFilter) {
      parentElements = applyElementFilter(parentElements, tuple.extendsFilter, parent.name);
    }

    // Check for named element overrides
    const childNamedElements = new Map<string, ASTTupleElement>();
    const childAppendElements: ASTTupleElement[] = [];

    for (const el of tuple.elements) {
      if (el.name) {
        const parentIdx = parentElements.findIndex((pe) => pe.name === el.name);
        if (parentIdx !== -1) {
          childNamedElements.set(el.name, el);
        } else {
          childAppendElements.push(el);
        }
      } else {
        childAppendElements.push(el);
      }
    }

    // Build merged: parent elements with overrides applied, then appended
    const mergedElements = parentElements.map((pe) => {
      if (pe.name && childNamedElements.has(pe.name)) {
        return childNamedElements.get(pe.name)!;
      }

      return pe;
    });
    mergedElements.push(...childAppendElements);

    const cleanElements = mergedElements.map(stripElementPrivate);

    resolved.set(tuple.name, {
      name: tuple.name,
      elements: cleanElements,
      range: tuple.range,
    });
  }

  return sorted.map((t) => resolved.get(t.name)!);
}

// ──────────────────────────────────────────────
// Enum Resolution
// ──────────────────────────────────────────────

/**
 * Resolve enum inheritance chains.
 *
 * Parent values (after filter) merged with child values.
 * Duplicates are deduplicated (child adding existing value is idempotent).
 */
function resolveEnums(enums: readonly ASTEnum[]): ASTEnum[] {
  const sorted = topologicalSort(enums);
  const resolved = new Map<string, ASTEnum>();

  for (const enum_ of sorted) {
    if (!enum_.extends) {
      resolved.set(enum_.name, { ...enum_ });
      continue;
    }

    const parent = resolved.get(enum_.extends);
    if (!parent) {
      resolved.set(enum_.name, { ...enum_ });
      continue;
    }

    let parentValues = parent.values;
    if (enum_.extendsFilter) {
      parentValues = applyValueFilter(parentValues, enum_.extendsFilter, parent.name);
    }

    // Merge with deduplication: parent values first, then unique child values
    const valueSet = new Set(parentValues);
    const mergedValues = [...parentValues];
    for (const v of enum_.values) {
      if (!valueSet.has(v)) {
        mergedValues.push(v);
        valueSet.add(v);
      }
    }

    resolved.set(enum_.name, {
      name: enum_.name,
      values: mergedValues,
      range: enum_.range,
    });
  }

  return sorted.map((e) => resolved.get(e.name)!);
}

// ──────────────────────────────────────────────
// Literal Resolution
// ──────────────────────────────────────────────

/**
 * Resolve literal inheritance chains.
 *
 * Parent variants (after filter) merged with child variants.
 * Duplicates by variant identity are deduplicated.
 */
function resolveLiterals(literals: readonly ASTLiteral[]): ASTLiteral[] {
  const sorted = topologicalSort(literals);
  const resolved = new Map<string, ASTLiteral>();

  for (const literal of sorted) {
    if (!literal.extends) {
      resolved.set(literal.name, { ...literal });
      continue;
    }

    const parent = resolved.get(literal.extends);
    if (!parent) {
      resolved.set(literal.name, { ...literal });
      continue;
    }

    let parentVariants = parent.variants;
    if (literal.extendsFilter) {
      parentVariants = applyVariantFilter(parentVariants, literal.extendsFilter, parent.name);
    }

    // Merge with deduplication by variant identity
    const identitySet = new Set(parentVariants.map(getVariantIdentity));
    const mergedVariants = [...parentVariants];
    for (const v of literal.variants) {
      const id = getVariantIdentity(v);
      if (!identitySet.has(id)) {
        mergedVariants.push(v);
        identitySet.add(id);
      }
    }

    resolved.set(literal.name, {
      name: literal.name,
      variants: mergedVariants,
      range: literal.range,
    });
  }

  return sorted.map((l) => resolved.get(l.name)!);
}

// ──────────────────────────────────────────────
// Main Entry Point
// ──────────────────────────────────────────────

/**
 * Resolve all inheritance in a SchemaAST.
 *
 * Processes all 5 type kinds: models, objects, tuples, enums, literals.
 * Returns a new SchemaAST with all extends chains flattened — no
 * extends/extendsFilter properties remain on resolved types.
 *
 * Does NOT mutate the input AST.
 */
export function resolveInheritance(ast: SchemaAST): SchemaAST {
  return {
    models: resolveModels(ast.models),
    objects: resolveObjects(ast.objects),
    tuples: resolveTuples(ast.tuples),
    enums: resolveEnums(ast.enums),
    literals: resolveLiterals(ast.literals),
    source: ast.source,
  };
}
