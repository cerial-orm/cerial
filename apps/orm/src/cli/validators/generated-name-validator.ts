/**
 * Generated-name validator - every name a schema carries into generated code and DDL
 *
 * Runs on the AST, so `.cerial` and TypeScript sources alike are held to `generatedNameProblem`.
 */

import type { Origin, SchemaAST } from '../../types';
import { generatedNameProblem, isPrototypeName } from '../../utils/generated-name';
import { located } from './origin-location';
import type { SchemaValidationError } from './schema-validator';

/** Refuse every name in the schema that is not a valid generated name */
export function validateGeneratedNames(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  const check = (name: unknown, kind: string, owner: string | undefined, origin: Origin) => {
    const problem = generatedNameProblem(name, kind);
    if (problem === undefined) return;
    const where = owner ? ` in ${owner}` : '';
    errors.push({ message: `Invalid ${kind} name ${JSON.stringify(name)}${where}: ${problem}`, ...located(origin) });
  };

  for (const model of ast.models) {
    check(model.name, 'model', undefined, model.origin);
    for (const field of model.fields) check(field.name, 'field', `model ${model.name}`, field.origin);
    for (const directive of model.directives ?? []) {
      check(directive.name, 'directive', `model ${model.name}`, directive.origin);
    }
  }

  for (const object of ast.objects) {
    check(object.name, 'object', undefined, object.origin);
    for (const field of object.fields) check(field.name, 'field', `object ${object.name}`, field.origin);
  }

  for (const tuple of ast.tuples) {
    check(tuple.name, 'tuple', undefined, tuple.origin);
    for (const element of tuple.elements) {
      // A .cerial element carries a placeholder range, so the error points at the tuple's own line instead
      const placeholder = element.origin.kind === 'dsl' && element.origin.range.start.line === 0;
      if (element.name !== undefined) {
        check(element.name, 'tuple element', `tuple ${tuple.name}`, placeholder ? tuple.origin : element.origin);
      }
    }
  }

  for (const literal of ast.literals) {
    check(literal.name, 'literal', undefined, literal.origin);
    for (const variant of literal.variants) {
      if (variant.kind === 'string' && isPrototypeName(variant.value)) {
        const message = `Invalid literal value ${JSON.stringify(variant.value)} in literal ${literal.name}: '${variant.value}' is reserved`;
        errors.push({ message, ...located(literal.origin) });
      }
      if (variant.kind === 'tupleRef') check(variant.tupleName, 'tuple', `literal ${literal.name}`, literal.origin);
      if (variant.kind === 'objectRef') check(variant.objectName, 'object', `literal ${literal.name}`, literal.origin);
      if (variant.kind === 'literalRef')
        check(variant.literalName, 'literal', `literal ${literal.name}`, literal.origin);
    }
  }

  for (const enumDef of ast.enums) {
    check(enumDef.name, 'enum', undefined, enumDef.origin);
    for (const value of enumDef.values) check(value, 'enum value', `enum ${enumDef.name}`, enumDef.origin);
  }

  return errors;
}
