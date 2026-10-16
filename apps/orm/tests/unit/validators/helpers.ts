import { validateDuplicateNames, validateExtends, validateSchema } from '../../../src/cli/validators';
import type { ASTDecorator, ASTField, ASTModel, ASTObject, SchemaAST, SchemaDecorator } from '../../../src/types';

/**
 * Every error `cerial generate` can raise for a parsed schema: the name and extends checks it runs on the
 * raw AST, plus the schema validator. Tests that call this exercise the live path rather than a lone helper.
 */
export function validateAll(ast: SchemaAST) {
  return [...validateDuplicateNames(ast), ...validateExtends(ast), ...validateSchema(ast).errors];
}

export function distinctDecorator(): ASTDecorator {
  return { type: 'distinct', range };
}

export function sortDecorator(): ASTDecorator {
  return { type: 'sort', range };
}

export function idDecorator(): ASTDecorator {
  return { type: 'id', range };
}

export function createField(overrides: Partial<ASTField> = {}): ASTField {
  return {
    name: 'testField',
    type: 'string',
    isOptional: false,
    isArray: false,
    decorators: [],
    range,
    ...overrides,
  };
}

export function createModel(overrides: Partial<ASTModel> = {}): ASTModel {
  return {
    name: 'TestModel',
    fields: [],
    range,
    ...overrides,
  };
}

export function createAST(models: ASTModel[] = [], objects: ASTObject[] = []): SchemaAST {
  return { source: '', models, objects, tuples: [], literals: [], enums: [] };
}

export const range = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

export function createObject(overrides: Partial<ASTObject> = {}): ASTObject {
  return {
    name: 'TestObject',
    fields: [],
    range,
    ...overrides,
  };
}

export function createASTField(overrides: Partial<ASTField> = {}): ASTField {
  return {
    name: 'testField',
    type: 'string',
    isOptional: false,
    isArray: false,
    decorators: [],
    range: {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
    },
    ...overrides,
  };
}

export function createASTModel(overrides: Partial<ASTModel> = {}): ASTModel {
  return {
    name: 'TestModel',
    fields: [],
    range: {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
    },
    ...overrides,
  };
}

export function createDecorator(type: SchemaDecorator, value?: unknown): ASTDecorator {
  return {
    type,
    value,
    range: {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
    },
  };
}
