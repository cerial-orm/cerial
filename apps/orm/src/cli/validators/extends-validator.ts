/**
 * Extends validator - validates extends, abstract, and private field rules
 *
 * Validation Rules:
 * 1. Extends target exists in the same kind registry (model→model, object→object, etc.)
 * 2. No cross-kind extends (model can't extend an object name, etc.)
 * 3. No circular extends (DFS cycle detection with full path reporting)
 * 4. Abstract rules: abstract only on models, all models can only extend abstract,
 *    no @@index/@@unique on abstract
 * 5. Private override: child body can't redefine parent's !!private field
 * 6. Pick/omit fields: all referenced fields must exist in the parent
 */

import {
  getEnum,
  getExtendsTarget,
  getLiteral,
  getModel,
  getObject,
  getTuple,
  hasDecorator,
  isAbstract,
  isPrivateField,
  isPrivateTupleElement,
} from '../../parser/types/ast';
import type { SchemaAST } from '../../types';
import type { SchemaValidationError } from './schema-validator';

// ── Type kind helpers ────────────────────────────────────────────────────

type TypeKind = 'model' | 'object' | 'tuple' | 'enum' | 'literal';

/** Get all type names registered under a specific kind */
function getKindNames(ast: SchemaAST, kind: TypeKind): Set<string> {
  switch (kind) {
    case 'model':
      return new Set(ast.models.map((m) => m.name));
    case 'object':
      return new Set(ast.objects.map((o) => o.name));
    case 'tuple':
      return new Set(ast.tuples.map((t) => t.name));
    case 'enum':
      return new Set(ast.enums.map((e) => e.name));
    case 'literal':
      return new Set(ast.literals.map((l) => l.name));
  }
}

/** Find which kind a name belongs to (excluding the expected kind) */
function findCrossKind(ast: SchemaAST, name: string, excludeKind: TypeKind): TypeKind | null {
  const kinds: TypeKind[] = ['model', 'object', 'tuple', 'enum', 'literal'];
  for (const kind of kinds) {
    if (kind === excludeKind) continue;
    if (getKindNames(ast, kind).has(name)) return kind;
  }

  return null;
}

// ── Validator 0: Empty extends filter ────────────────────────────────────

/**
 * Validate that extends filter brackets are not empty.
 * `extends Y[]` is meaningless — use `extends Y` to inherit all,
 * or specify fields to pick/omit.
 */
export function validateEmptyExtendsFilter(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  const check = (
    items: Array<{
      name: string;
      extends?: string;
      extendsFilter?: { mode: 'pick' | 'omit'; fields: string[] };
      range: { start: { line: number } };
    }>,
    kind: TypeKind,
  ): void => {
    for (const item of items) {
      if (!item.extendsFilter) continue;
      if (!item.extendsFilter.fields.length) {
        errors.push({
          message: `${kind} "${item.name}" has empty extends filter brackets. Use "extends ${item.extends}" to inherit all, or specify fields to pick/omit inside the brackets.`,
          line: item.range.start.line,
        });
      }
    }
  };

  check(ast.models, 'model');
  check(ast.objects, 'object');
  check(ast.tuples, 'tuple');
  check(ast.enums, 'enum');
  check(ast.literals, 'literal');

  return errors;
}

// ── Validator 1: Target exists ───────────────────────────────────────────

/**
 * Validate that all extends targets exist in their same kind registry.
 * Model must extend a model name, object must extend an object name, etc.
 */
export function validateExtendsTargetExists(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  const check = (
    items: Array<{ name: string; extends?: string; range: { start: { line: number } } }>,
    kind: TypeKind,
    registry: Set<string>,
  ): void => {
    for (const item of items) {
      const target = item.extends;
      if (!target) continue;
      if (!registry.has(target)) {
        errors.push({
          message: `${kind} "${item.name}" extends "${target}", but no ${kind} with that name exists.`,
          line: item.range.start.line,
        });
      }
    }
  };

  check(ast.models, 'model', getKindNames(ast, 'model'));
  check(ast.objects, 'object', getKindNames(ast, 'object'));
  check(ast.tuples, 'tuple', getKindNames(ast, 'tuple'));
  check(ast.enums, 'enum', getKindNames(ast, 'enum'));
  check(ast.literals, 'literal', getKindNames(ast, 'literal'));

  return errors;
}

// ── Validator 2: No cross-kind extends ──────────────────────────────────

/**
 * Validate that a type does not extend a name from a different kind.
 * E.g., a model can't extend an object name.
 * Only reports when the target actually exists in a different registry.
 * (Missing targets are handled by validateExtendsTargetExists.)
 */
export function validateNoCrossKindExtends(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  const check = (
    items: Array<{ name: string; extends?: string; range: { start: { line: number } } }>,
    kind: TypeKind,
  ): void => {
    for (const item of items) {
      const target = item.extends;
      if (!target) continue;

      const crossKind = findCrossKind(ast, target, kind);
      if (crossKind) {
        errors.push({
          message: `${kind} "${item.name}" extends "${target}", but "${target}" is a ${crossKind}, not a ${kind}. A ${kind} can only extend another ${kind}.`,
          line: item.range.start.line,
        });
      }
    }
  };

  check(ast.models, 'model');
  check(ast.objects, 'object');
  check(ast.tuples, 'tuple');
  check(ast.enums, 'enum');
  check(ast.literals, 'literal');

  return errors;
}

// ── Validator 3: No circular extends ────────────────────────────────────

/**
 * DFS-based cycle detection. Reports the full cycle path.
 * Handles self-reference as a special case of cycle.
 */
export function validateNoCircularExtends(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  const detectCycles = (
    items: Array<{ name: string; extends?: string; range: { start: { line: number } } }>,
    kind: TypeKind,
  ): void => {
    // Build adjacency map: name → extends target
    const extendsMap = new Map<string, string>();
    const rangeMap = new Map<string, number>();
    for (const item of items) {
      if (item.extends) {
        extendsMap.set(item.name, item.extends);
        rangeMap.set(item.name, item.range.start.line);
      }
    }

    const visited = new Set<string>();
    const reported = new Set<string>();

    for (const [name] of extendsMap) {
      if (visited.has(name)) continue;

      // Walk the chain from this node
      const path: string[] = [];
      const pathSet = new Set<string>();
      let current: string | undefined = name;

      while (current && !visited.has(current)) {
        if (pathSet.has(current)) {
          // Found cycle - extract it
          const cycleStart = path.indexOf(current);
          const cycle = path.slice(cycleStart);
          cycle.push(current);

          // Only report once per cycle
          const cycleKey = [...cycle].sort().join(',');
          if (!reported.has(cycleKey)) {
            reported.add(cycleKey);
            errors.push({
              message: `Circular extends in ${kind}s: ${cycle.join(' → ')}`,
              line: rangeMap.get(current) ?? 1,
            });
          }
          break;
        }

        path.push(current);
        pathSet.add(current);
        current = extendsMap.get(current);
      }

      // Mark all nodes in path as visited
      for (const node of path) {
        visited.add(node);
      }
    }
  };

  detectCycles(ast.models, 'model');
  detectCycles(ast.objects, 'object');
  detectCycles(ast.tuples, 'tuple');
  detectCycles(ast.enums, 'enum');
  detectCycles(ast.literals, 'literal');

  return errors;
}

// ── Validator 4: Abstract rules ─────────────────────────────────────────

/**
 * Validate abstract model rules:
 * - All models (abstract or concrete) can only extend abstract models
 * - No @@index/@@unique directives on abstract models
 * (Abstract is only valid on models — the parser only sets it on ASTModel)
 */
export function validateAbstractRules(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  for (const m of ast.models) {
    // All models can only extend abstract models
    const target = getExtendsTarget(m);
    if (target) {
      const parent = getModel(ast, target);
      if (parent && !isAbstract(parent)) {
        if (isAbstract(m)) {
          errors.push({
            message: `Abstract model "${m.name}" cannot extend concrete model "${target}". An abstract model can only extend another abstract model.`,
            model: m.name,
            line: m.range.start.line,
          });
        } else {
          errors.push({
            message: `Model "${m.name}" extends concrete model "${target}". Models can only extend abstract models.`,
            model: m.name,
            line: m.range.start.line,
          });
        }
      }
    }

    // No @@index/@@unique on abstract models
    if (isAbstract(m) && m.directives?.length) {
      for (const directive of m.directives) {
        errors.push({
          message: `Abstract model "${m.name}" cannot have @@${directive.kind} directive "${directive.name}". Composite directives are only allowed on concrete models.`,
          model: m.name,
          line: directive.range.start.line,
        });
      }
    }
  }

  return errors;
}

// ── Validator 5: Private override ───────────────────────────────────────

/**
 * Validate that child body does NOT redefine fields marked as !!private in parent.
 * Private ONLY prevents override in the child's body — NOT omit/pick exclusion.
 * Works on raw AST (before resolution).
 */
export function validatePrivateOverride(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  // Check models
  for (const m of ast.models) {
    const target = getExtendsTarget(m);
    if (!target) continue;

    const parent = getModel(ast, target);
    if (!parent) continue;

    const privateFieldNames = new Set(parent.fields.filter((f) => isPrivateField(f)).map((f) => f.name));

    for (const childField of m.fields) {
      if (privateFieldNames.has(childField.name)) {
        errors.push({
          message: `Field "${childField.name}" in model "${m.name}" overrides a private field from parent "${target}". Private fields cannot be overridden.`,
          model: m.name,
          field: childField.name,
          line: childField.range.start.line,
        });
      }
    }
  }

  // Check objects
  for (const o of ast.objects) {
    const target = getExtendsTarget(o);
    if (!target) continue;

    const parent = getObject(ast, target);
    if (!parent) continue;

    const privateFieldNames = new Set(parent.fields.filter((f) => isPrivateField(f)).map((f) => f.name));

    for (const childField of o.fields) {
      if (privateFieldNames.has(childField.name)) {
        errors.push({
          message: `Field "${childField.name}" in object "${o.name}" overrides a private field from parent "${target}". Private fields cannot be overridden.`,
          field: childField.name,
          line: childField.range.start.line,
        });
      }
    }
  }

  // Check tuples (by element name or index)
  for (const t of ast.tuples) {
    const target = getExtendsTarget(t);
    if (!target) continue;

    const parent = getTuple(ast, target);
    if (!parent) continue;

    // Build set of private element identifiers (name or index)
    const privateElements = new Map<string, true>();
    for (let i = 0; i < parent.elements.length; i++) {
      const el = parent.elements[i]!;
      if (isPrivateTupleElement(el)) {
        const key = el.name ?? String(i);
        privateElements.set(key, true);
      }
    }

    for (let i = 0; i < t.elements.length; i++) {
      const childEl = t.elements[i]!;
      const key = childEl.name ?? String(i);
      if (privateElements.has(key)) {
        errors.push({
          message: `Element "${key}" in tuple "${t.name}" overrides a private element from parent "${target}". Private elements cannot be overridden.`,
          line: t.range.start.line,
        });
      }
    }
  }

  return errors;
}

// ── Validator 6: Pick/Omit fields ───────────────────────────────────────

/** Get the valid field/value identifiers for a parent type */
function getParentIdentifiers(
  ast: SchemaAST,
  kind: TypeKind,
  parentName: string,
): { names: Set<string>; elementCount?: number } | null {
  switch (kind) {
    case 'model': {
      const parent = getModel(ast, parentName);
      if (!parent) return null;

      return { names: new Set(parent.fields.map((f) => f.name)) };
    }
    case 'object': {
      const parent = getObject(ast, parentName);
      if (!parent) return null;

      return { names: new Set(parent.fields.map((f) => f.name)) };
    }
    case 'tuple': {
      const parent = getTuple(ast, parentName);
      if (!parent) return null;

      const names = new Set<string>();
      for (let i = 0; i < parent.elements.length; i++) {
        const el = parent.elements[i]!;
        if (el.name) names.add(el.name);
        names.add(String(i)); // Always allow index reference
      }

      return { names, elementCount: parent.elements.length };
    }
    case 'enum': {
      const parent = getEnum(ast, parentName);
      if (!parent) return null;

      return { names: new Set(parent.values) };
    }
    case 'literal': {
      const parent = getLiteral(ast, parentName);
      if (!parent) return null;

      const names = new Set<string>();
      for (const v of parent.variants) {
        // Use a string representation of each variant as its identifier
        switch (v.kind) {
          case 'string':
            names.add(v.value);
            break;
          case 'int':
          case 'float':
            names.add(String(v.value));
            break;
          case 'bool':
            names.add(String(v.value));
            break;
          case 'broadType':
            names.add(v.typeName);
            break;
          case 'tupleRef':
            names.add(v.tupleName);
            break;
          case 'objectRef':
            names.add(v.objectName);
            break;
          case 'literalRef':
            names.add(v.literalName);
            break;
        }
      }

      return { names };
    }
  }
}

/**
 * Validate that all fields in pick/omit lists exist in the parent.
 * For tuples, validates index references are within bounds.
 * Does NOT enforce private constraints — private only prevents override.
 */
export function validatePickOmitFields(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  const check = (
    items: Array<{
      name: string;
      extends?: string;
      extendsFilter?: { mode: 'pick' | 'omit'; fields: string[] };
      range: { start: { line: number } };
    }>,
    kind: TypeKind,
  ): void => {
    for (const item of items) {
      const target = item.extends;
      const filter = item.extendsFilter;
      if (!target || !filter) continue;

      const parentInfo = getParentIdentifiers(ast, kind, target);
      if (!parentInfo) continue; // Missing parent handled by validateExtendsTargetExists

      for (const fieldRef of filter.fields) {
        // For tuples, check if numeric index is in bounds
        if (kind === 'tuple' && parentInfo.elementCount !== undefined) {
          const idx = Number(fieldRef);
          if (!Number.isNaN(idx) && Number.isInteger(idx)) {
            if (idx < 0 || idx >= parentInfo.elementCount) {
              errors.push({
                message: `${kind} "${item.name}" ${filter.mode} references index "${fieldRef}" which is out of bounds in parent "${target}" (${parentInfo.elementCount} elements).`,
                line: item.range.start.line,
              });
              continue;
            }
          }
        }

        if (!parentInfo.names.has(fieldRef)) {
          errors.push({
            message: `${kind} "${item.name}" ${filter.mode} references "${fieldRef}" which does not exist in parent "${target}".`,
            line: item.range.start.line,
          });
        }
      }
    }
  };

  check(ast.models, 'model');
  check(ast.objects, 'object');
  check(ast.tuples, 'tuple');
  check(ast.enums, 'enum');
  check(ast.literals, 'literal');

  return errors;
}

// ── Validator 7: Empty types (pre-resolution) ──────────────────────────

/**
 * Validate that types without extends have at least one field/element/value.
 * A type with 0 own items and no extends clause is always invalid — it would
 * produce an empty type after resolution.
 */
export function validateEmptyTypes(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  for (const m of ast.models) {
    if (!m.fields.length && !getExtendsTarget(m)) {
      errors.push({
        message: `Model "${m.name}" has no fields. A model must have at least one field, or extend a parent type.`,
        model: m.name,
        line: m.range.start.line,
      });
    }
  }

  for (const o of ast.objects) {
    if (!o.fields.length && !getExtendsTarget(o)) {
      errors.push({
        message: `Object "${o.name}" has no fields. An object must have at least one field, or extend a parent type.`,
        line: o.range.start.line,
      });
    }
  }

  for (const t of ast.tuples) {
    if (!t.elements.length && !getExtendsTarget(t)) {
      errors.push({
        message: `Tuple "${t.name}" has no elements. A tuple must have at least one element, or extend a parent type.`,
        line: t.range.start.line,
      });
    }
  }

  for (const e of ast.enums) {
    if (!e.values.length && !getExtendsTarget(e)) {
      errors.push({
        message: `Enum "${e.name}" has no values. An enum must have at least one value, or extend a parent type.`,
        line: e.range.start.line,
      });
    }
  }

  for (const l of ast.literals) {
    if (!l.variants.length && !getExtendsTarget(l)) {
      errors.push({
        message: `Literal "${l.name}" has no variants. A literal must have at least one variant, or extend a parent type.`,
        line: l.range.start.line,
      });
    }
  }

  return errors;
}

// ── Validator 8: Empty types (post-resolution) ─────────────────────────

/**
 * Validate that no type is empty after inheritance resolution.
 * This catches cases where extends + pick/omit removes all items.
 * Runs on the FULL resolved AST (including abstract models).
 */
export function validateResolvedTypes(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  for (const m of ast.models) {
    if (!m.fields.length) {
      errors.push({
        message: `Model "${m.name}" has no fields after inheritance resolution. Check that the extends clause and pick/omit filters leave at least one field.`,
        model: m.name,
        line: m.range.start.line,
      });
    }
  }

  for (const o of ast.objects) {
    if (!o.fields.length) {
      errors.push({
        message: `Object "${o.name}" has no fields after inheritance resolution. Check that the extends clause and pick/omit filters leave at least one field.`,
        line: o.range.start.line,
      });
    }
  }

  for (const t of ast.tuples) {
    if (!t.elements.length) {
      errors.push({
        message: `Tuple "${t.name}" has no elements after inheritance resolution. Check that the extends clause and pick/omit filters leave at least one element.`,
        line: t.range.start.line,
      });
    }
  }

  for (const e of ast.enums) {
    if (!e.values.length) {
      errors.push({
        message: `Enum "${e.name}" has no values after inheritance resolution. Check that the extends clause and pick/omit filters leave at least one value.`,
        line: e.range.start.line,
      });
    }
  }

  for (const l of ast.literals) {
    if (!l.variants.length) {
      errors.push({
        message: `Literal "${l.name}" has no variants after inheritance resolution. Check that the extends clause and pick/omit filters leave at least one variant.`,
        line: l.range.start.line,
      });
    }
  }

  return errors;
}

// ── Validator 9: Concrete model @id check (pre-resolution) ─────────────

/**
 * Validate that every concrete (non-abstract) model without extends has an @id field.
 *
 * Runs on the RAW AST (pre-resolution). Models with extends may legitimately
 * lose their @id through pick/omit — the pick may intentionally exclude it.
 * Abstract models don't generate tables and don't need @id.
 */
export function validateModelIdField(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  for (const m of ast.models) {
    // Skip abstract models — they don't generate tables
    if (isAbstract(m)) continue;

    // Skip models that use extends — they may inherit @id from parent,
    // or intentionally exclude it via pick/omit
    if (getExtendsTarget(m)) continue;

    const hasId = m.fields.some((f) => hasDecorator(f, 'id'));
    if (!hasId) {
      errors.push({
        message: `Model "${m.name}" does not have an @id field. Every concrete model must have exactly one field with @id.`,
        model: m.name,
        line: m.range.start.line,
      });
    }
  }

  return errors;
}

// ── Orchestrator ─────────────────────────────────────────────────────────

/** Validate all extends-related rules */
export function validateExtends(ast: SchemaAST): SchemaValidationError[] {
  return [
    ...validateEmptyTypes(ast),
    ...validateEmptyExtendsFilter(ast),
    ...validateExtendsTargetExists(ast),
    ...validateNoCrossKindExtends(ast),
    ...validateNoCircularExtends(ast),
    ...validateAbstractRules(ast),
    ...validatePrivateOverride(ast),
    ...validatePickOmitFields(ast),
    ...validateModelIdField(ast),
  ];
}
