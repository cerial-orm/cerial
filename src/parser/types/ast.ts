/**
 * AST types and helpers for schema parsing
 */

import type {
  ASTCompositeDirective,
  ASTDecorator,
  ASTField,
  ASTLiteral,
  ASTLiteralVariant,
  ASTModel,
  ASTObject,
  ASTTuple,
  ASTTupleElement,
  SchemaAST,
  SchemaDecorator,
  SchemaFieldType,
  SourcePosition,
  SourceRange,
} from '../../types';

/** Create a source position */
export function createPosition(line: number, column: number, offset: number): SourcePosition {
  return { line, column, offset };
}

/** Create a source range */
export function createRange(start: SourcePosition, end: SourcePosition): SourceRange {
  return { start, end };
}

/** Create an AST decorator node */
export function createDecorator(type: SchemaDecorator, range: SourceRange, value?: unknown): ASTDecorator {
  return { type, value, range };
}

/** Create an AST field node */
export function createField(
  name: string,
  type: SchemaFieldType,
  isOptional: boolean,
  decorators: ASTDecorator[],
  range: SourceRange,
  isArray?: boolean,
  objectName?: string,
  tupleName?: string,
  literalName?: string,
): ASTField {
  const field: ASTField = { name, type, isOptional, decorators, range };
  if (decorators.some((d) => d.type === 'nullable')) field.isNullable = true;
  if (isArray) field.isArray = true;
  if (objectName) field.objectName = objectName;
  if (tupleName) field.tupleName = tupleName;
  if (literalName) field.literalName = literalName;

  return field;
}

/** Create an AST composite directive node (@@index or @@unique) */
export function createCompositeDirective(
  kind: 'index' | 'unique',
  name: string,
  fields: string[],
  range: SourceRange,
): ASTCompositeDirective {
  return { kind, name, fields, range };
}

/** Create an AST model node */
export function createModel(
  name: string,
  fields: ASTField[],
  range: SourceRange,
  directives: ASTCompositeDirective[] = [],
): ASTModel {
  return { name, fields, directives, range };
}

/** Create an AST object node (embedded data structure) */
export function createObject(name: string, fields: ASTField[], range: SourceRange): ASTObject {
  return { name, fields, range };
}

/** Create a schema AST */
export function createSchemaAST(
  models: ASTModel[],
  source: string,
  objects: ASTObject[] = [],
  tuples: ASTTuple[] = [],
  literals: ASTLiteral[] = [],
): SchemaAST {
  return { models, objects, tuples, literals, source };
}

/** Check if AST has a model with given name */
export function hasModel(ast: SchemaAST, name: string): boolean {
  return ast.models.some((m) => m.name === name);
}

/** Get a model by name from AST */
export function getModel(ast: SchemaAST, name: string): ASTModel | undefined {
  return ast.models.find((m) => m.name === name);
}

/** Check if a field has a specific decorator */
export function hasDecorator(field: ASTField, type: SchemaDecorator): boolean {
  return field.decorators.some((d) => d.type === type);
}

/** Get a decorator from a field */
export function getDecorator(field: ASTField, type: SchemaDecorator): ASTDecorator | undefined {
  return field.decorators.find((d) => d.type === type);
}

/** Get all field names from a model */
export function getFieldNames(model: ASTModel): string[] {
  return model.fields.map((f) => f.name);
}

/** Get all model names from AST */
export function getModelNames(ast: SchemaAST): string[] {
  return ast.models.map((m) => m.name);
}

/** Check if AST has an object with given name */
export function hasObject(ast: SchemaAST, name: string): boolean {
  return ast.objects.some((o) => o.name === name);
}

/** Get an object by name from AST */
export function getObject(ast: SchemaAST, name: string): ASTObject | undefined {
  return ast.objects.find((o) => o.name === name);
}

/** Get all object names from AST */
export function getObjectNames(ast: SchemaAST): string[] {
  return ast.objects.map((o) => o.name);
}

/** Create an AST tuple element node */
export function createTupleElement(
  type: SchemaFieldType,
  isOptional: boolean,
  name?: string,
  objectName?: string,
  tupleName?: string,
  decorators?: ASTDecorator[],
  literalName?: string,
): ASTTupleElement {
  const element: ASTTupleElement = { type, isOptional };
  if (name) element.name = name;
  if (objectName) element.objectName = objectName;
  if (tupleName) element.tupleName = tupleName;
  if (literalName) element.literalName = literalName;
  if (decorators?.length) {
    element.decorators = decorators;
    if (decorators.some((d) => d.type === 'nullable')) element.isNullable = true;
  }

  return element;
}

/** Create an AST tuple node */
export function createTuple(name: string, elements: ASTTupleElement[], range: SourceRange): ASTTuple {
  return { name, elements, range };
}

/** Check if AST has a tuple with given name */
export function hasTuple(ast: SchemaAST, name: string): boolean {
  return ast.tuples.some((t) => t.name === name);
}

/** Get a tuple by name from AST */
export function getTuple(ast: SchemaAST, name: string): ASTTuple | undefined {
  return ast.tuples.find((t) => t.name === name);
}

/** Get all tuple names from AST */
export function getTupleNames(ast: SchemaAST): string[] {
  return ast.tuples.map((t) => t.name);
}

/** Create an AST literal node */
export function createLiteral(name: string, variants: ASTLiteralVariant[], range: SourceRange): ASTLiteral {
  return { name, variants, range };
}

/** Check if AST has a literal with given name */
export function hasLiteral(ast: SchemaAST, name: string): boolean {
  return ast.literals.some((l) => l.name === name);
}

/** Get a literal by name from AST */
export function getLiteral(ast: SchemaAST, name: string): ASTLiteral | undefined {
  return ast.literals.find((l) => l.name === name);
}

/** Get all literal names from AST */
export function getLiteralNames(ast: SchemaAST): string[] {
  return ast.literals.map((l) => l.name);
}
