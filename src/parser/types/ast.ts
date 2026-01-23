/**
 * AST types and helpers for schema parsing
 */

import type {
  SchemaFieldType,
  SchemaDecorator,
  SourcePosition,
  SourceRange,
  ASTDecorator,
  ASTField,
  ASTModel,
  SchemaAST,
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
export function createDecorator(
  type: SchemaDecorator,
  range: SourceRange,
  value?: unknown,
): ASTDecorator {
  return { type, value, range };
}

/** Create an AST field node */
export function createField(
  name: string,
  type: SchemaFieldType,
  isOptional: boolean,
  decorators: ASTDecorator[],
  range: SourceRange,
): ASTField {
  return { name, type, isOptional, decorators, range };
}

/** Create an AST model node */
export function createModel(
  name: string,
  fields: ASTField[],
  range: SourceRange,
): ASTModel {
  return { name, fields, range };
}

/** Create a schema AST */
export function createSchemaAST(models: ASTModel[], source: string): SchemaAST {
  return { models, source };
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
