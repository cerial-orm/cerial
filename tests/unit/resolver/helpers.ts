/**
 * Shared test helpers for inheritance resolver tests
 */

import type {
  ASTDecorator,
  ASTEnum,
  ASTField,
  ASTLiteral,
  ASTLiteralVariant,
  ASTModel,
  ASTObject,
  ASTTuple,
  ASTTupleElement,
  ExtendsFilter,
  SchemaAST,
} from '../../../src/types';

export const R = { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } };

export function field(name: string, opts?: Partial<ASTField>): ASTField {
  return { name, type: 'string', isOptional: false, decorators: [], range: R, ...opts };
}

export function element(type: string, opts?: Partial<ASTTupleElement>): ASTTupleElement {
  return { type: type as ASTTupleElement['type'], isOptional: false, ...opts };
}

export function dec(type: string): ASTDecorator {
  return { type: type as ASTDecorator['type'], range: R };
}

export function model(name: string, fields: ASTField[], opts?: Partial<ASTModel>): ASTModel {
  return { name, fields, range: R, ...opts };
}

export function obj(name: string, fields: ASTField[], opts?: Partial<ASTObject>): ASTObject {
  return { name, fields, range: R, ...opts };
}

export function tuple(name: string, elements: ASTTupleElement[], opts?: Partial<ASTTuple>): ASTTuple {
  return { name, elements, range: R, ...opts };
}

export function enumDef(name: string, values: string[], opts?: Partial<ASTEnum>): ASTEnum {
  return { name, values, range: R, ...opts };
}

export function literal(name: string, variants: ASTLiteralVariant[], opts?: Partial<ASTLiteral>): ASTLiteral {
  return { name, variants, range: R, ...opts };
}

export function ast(overrides?: Partial<SchemaAST>): SchemaAST {
  return {
    models: [],
    objects: [],
    tuples: [],
    literals: [],
    enums: [],
    source: '',
    ...overrides,
  };
}

export const pick = (fields: string[]): ExtendsFilter => ({ mode: 'pick', fields });
export const omit = (fields: string[]): ExtendsFilter => ({ mode: 'omit', fields });
