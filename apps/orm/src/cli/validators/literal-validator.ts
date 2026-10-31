/**
 * Literal validator - variants, references and circularity
 */

import type { ASTLiteral, ASTLiteralVariant, SchemaAST } from '../../types';
import { located } from './origin-location';
import type { SchemaValidationError } from './schema-validator';

function variantKey(variant: ASTLiteralVariant): string {
  switch (variant.kind) {
    case 'broadType':
      return `broadType:${variant.typeName}`;
    case 'tupleRef':
      return `tupleRef:${variant.tupleName}`;
    case 'objectRef':
      return `objectRef:${variant.objectName}`;
    case 'literalRef':
      return `literalRef:${variant.literalName}`;
    default:
      return `${variant.kind}:${variant.value}`;
  }
}

/** True when a literal holds anything beyond primitives, which inline type syntax cannot nest */
function hasComplexVariant(literal: ASTLiteral): boolean {
  return literal.variants.some((v) => v.kind === 'tupleRef' || v.kind === 'objectRef' || v.kind === 'literalRef');
}

function hasCircularRef(ast: SchemaAST, name: string, visited: Set<string>): boolean {
  if (visited.has(name)) return true;
  visited.add(name);

  const literal = ast.literals.find((l) => l.name === name);
  if (!literal) return false;

  return literal.variants.some((v) => v.kind === 'literalRef' && hasCircularRef(ast, v.literalName, new Set(visited)));
}

/** Validate literal definitions */
export function validateLiterals(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  for (const literal of ast.literals) {
    const at = located(literal.origin);
    const push = (message: string) => errors.push({ message, ...at });

    const seen = new Set<string>();
    for (const variant of literal.variants) {
      const key = variantKey(variant);
      if (seen.has(key)) push(`Duplicate variant in literal ${literal.name}`);
      seen.add(key);
    }

    for (const variant of literal.variants) {
      if (variant.kind === 'tupleRef') {
        const tuple = ast.tuples.find((t) => t.name === variant.tupleName);
        if (!tuple) {
          push(`Literal ${literal.name} references unknown tuple '${variant.tupleName}'`);
          continue;
        }

        tuple.elements.forEach((el, index) => {
          const elemName = el.name ?? `element[${index}]`;
          const prefix = `Tuple '${variant.tupleName}' referenced in literal '${literal.name}' contains`;
          const suffix = 'Only primitive and simple literal-typed elements are allowed in literal-referenced tuples';
          if (el.type === 'object') push(`${prefix} object element '${elemName}'. ${suffix}`);
          if (el.type === 'tuple') push(`${prefix} nested tuple element '${elemName}'. ${suffix}`);
          if (el.type === 'literal' && el.literalName) {
            const inner = ast.literals.find((l) => l.name === el.literalName);
            if (inner && hasComplexVariant(inner)) {
              push(
                `${prefix} literal element '${elemName}' referencing '${el.literalName}' which has non-primitive variants. Nested literals must only contain primitive variants`,
              );
            }
          }
        });
      }

      if (variant.kind === 'objectRef') {
        const obj = ast.objects.find((o) => o.name === variant.objectName);
        if (!obj) {
          push(`Literal ${literal.name} references unknown object '${variant.objectName}'`);
          continue;
        }

        for (const field of obj.fields) {
          const prefix = `Object '${variant.objectName}' referenced in literal '${literal.name}' contains`;
          const suffix = 'Only primitive and simple literal-typed fields are allowed in literal-referenced objects';
          if (field.type === 'object') push(`${prefix} object field '${field.name}'. ${suffix}`);
          if (field.type === 'tuple') push(`${prefix} tuple field '${field.name}'. ${suffix}`);
          if (field.type === 'literal' && field.literalName) {
            const inner = ast.literals.find((l) => l.name === field.literalName);
            if (inner && hasComplexVariant(inner)) {
              push(
                `${prefix} literal field '${field.name}' referencing '${field.literalName}' which has non-primitive variants. Nested literals must only contain primitive variants`,
              );
            }
          }
        }
      }

      if (variant.kind === 'literalRef') {
        const exists =
          ast.literals.some((l) => l.name === variant.literalName) ||
          ast.enums.some((e) => e.name === variant.literalName);
        if (!exists) push(`Literal ${literal.name} references unknown literal '${variant.literalName}'`);
      }
    }

    for (const variant of literal.variants) {
      if (variant.kind === 'literalRef' && hasCircularRef(ast, variant.literalName, new Set([literal.name]))) {
        push(`Circular literal reference detected: ${literal.name} -> ${variant.literalName}`);
      }
    }
  }

  return errors;
}

/** Validate that literal-typed model and object fields point at a declared literal or enum */
export function validateLiteralFieldReferences(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const known = new Set([...ast.literals.map((l) => l.name), ...ast.enums.map((e) => e.name)]);

  const check = (parent: string, fields: SchemaAST['models'][number]['fields'], modelName?: string) => {
    for (const field of fields) {
      if (field.type === 'literal' && field.literalName && !known.has(field.literalName)) {
        errors.push({
          message: `Field '${field.name}' in ${parent} references unknown literal '${field.literalName}'`,
          model: modelName,
          field: field.name,
          ...located(field.origin),
        });
      }
    }
  };

  for (const model of ast.models) check(`model ${model.name}`, model.fields, model.name);
  for (const object of ast.objects) check(`object ${object.name}`, object.fields);

  return errors;
}
