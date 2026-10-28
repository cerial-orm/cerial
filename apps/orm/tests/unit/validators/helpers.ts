import { validateDuplicateNames, validateExtends, validateSchema } from '../../../src/cli/validators';
import type {
  ASTDecorator,
  ASTEnum,
  ASTField,
  ASTLiteral,
  ASTModel,
  ASTObject,
  ASTTuple,
  ASTTupleElement,
  SchemaAST,
  SchemaDecorator,
} from '../../../src/types';
import { createDslOrigin } from '../../../src/parser';

/**
 * Every error `cerial generate` can raise for a parsed schema: the name and extends checks it runs on the
 * raw AST, plus the schema validator. Tests that call this exercise the live path rather than a lone helper.
 */
export function validateAll(ast: SchemaAST) {
  return [...validateDuplicateNames(ast), ...validateExtends(ast), ...validateSchema(ast).errors];
}

export function distinctDecorator(): ASTDecorator {
  return { type: 'distinct', range, origin: createDslOrigin(range) };
}

export function sortDecorator(): ASTDecorator {
  return { type: 'sort', range, origin: createDslOrigin(range) };
}

export function idDecorator(): ASTDecorator {
  return { type: 'id', range, origin: createDslOrigin(range) };
}

export function createField(overrides: Partial<ASTField> = {}): ASTField {
  return {
    name: 'testField',
    type: 'string',
    isOptional: false,
    isArray: false,
    decorators: [],
    range,
    origin: createDslOrigin(range),
    ...overrides,
    ...(overrides.range && !overrides.origin ? { origin: createDslOrigin(overrides.range) } : {}),
  };
}

export function createModel(overrides: Partial<ASTModel> = {}): ASTModel {
  return {
    name: 'TestModel',
    fields: [],
    range,
    origin: createDslOrigin(range),
    ...overrides,
    ...(overrides.range && !overrides.origin ? { origin: createDslOrigin(overrides.range) } : {}),
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
    origin: createDslOrigin(range),
    ...overrides,
    ...(overrides.range && !overrides.origin ? { origin: createDslOrigin(overrides.range) } : {}),
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
    origin: createDslOrigin({
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
    }),
    ...overrides,
    ...(overrides.range && !overrides.origin ? { origin: createDslOrigin(overrides.range) } : {}),
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
    origin: createDslOrigin({
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
    }),
    ...overrides,
    ...(overrides.range && !overrides.origin ? { origin: createDslOrigin(overrides.range) } : {}),
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
    origin: createDslOrigin({
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
    }),
  };
}

// Builders shared by the extends-validator specs

export function field(overrides: Partial<ASTField> = {}): ASTField {
  return {
    name: 'testField',
    type: 'string',
    isOptional: false,
    decorators: [],
    range,
    origin: createDslOrigin(range),
    ...overrides,
    ...(overrides.range && !overrides.origin ? { origin: createDslOrigin(overrides.range) } : {}),
  };
}

export function _dec(type: SchemaDecorator, value?: unknown): ASTDecorator {
  return { type, value, range, origin: createDslOrigin(range) };
}

export function model(overrides: Partial<ASTModel> = {}): ASTModel {
  return {
    name: 'TestModel',
    fields: [],
    range,
    origin: createDslOrigin(range),
    ...overrides,
    ...(overrides.range && !overrides.origin ? { origin: createDslOrigin(overrides.range) } : {}),
  };
}

export function obj(overrides: Partial<ASTObject> = {}): ASTObject {
  return {
    name: 'TestObject',
    fields: [],
    range,
    origin: createDslOrigin(range),
    ...overrides,
    ...(overrides.range && !overrides.origin ? { origin: createDslOrigin(overrides.range) } : {}),
  };
}

export function tuple(overrides: Partial<ASTTuple> = {}): ASTTuple {
  return {
    name: 'TestTuple',
    elements: [],
    range,
    origin: createDslOrigin(range),
    ...overrides,
    ...(overrides.range && !overrides.origin ? { origin: createDslOrigin(overrides.range) } : {}),
  };
}

export function literal(overrides: Partial<ASTLiteral> = {}): ASTLiteral {
  return {
    name: 'TestLiteral',
    variants: [],
    range,
    origin: createDslOrigin(range),
    ...overrides,
    ...(overrides.range && !overrides.origin ? { origin: createDslOrigin(overrides.range) } : {}),
  };
}

export function enumNode(overrides: Partial<ASTEnum> = {}): ASTEnum {
  return {
    name: 'TestEnum',
    values: [],
    range,
    origin: createDslOrigin(range),
    ...overrides,
    ...(overrides.range && !overrides.origin ? { origin: createDslOrigin(overrides.range) } : {}),
  };
}

export function tupleElement(overrides: Partial<ASTTupleElement> = {}): ASTTupleElement {
  return { origin: createDslOrigin(), type: 'string', isOptional: false, ...overrides };
}

export function ast(overrides: Partial<SchemaAST> = {}): SchemaAST {
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
