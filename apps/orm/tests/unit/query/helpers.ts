import {
  convertEnums,
  convertLiterals,
  convertModels,
  convertObjects,
  convertTuples,
  createLiteralRegistry,
  createTupleRegistry,
  inferFKTypes,
  resolveObjectFields,
} from '../../../src/generators/metadata';
import { createObjectRegistry, createRegistry } from '../../../src/generators/metadata/registry-generator';
import { parse } from '../../../src/parser/parser';
import type {
  FieldMetadata,
  ModelMetadata,
  ModelRegistry,
  TupleElementMetadata,
  TupleFieldMetadata,
} from '../../../src/types';

/** The model registry a schema text generates, resolved the way `cerial generate` resolves it */
export function registryFor(schema: string): ModelRegistry {
  const { ast } = parse(schema);
  const models = convertModels(ast.models);
  const objects = convertObjects(ast.objects);
  const tuples = convertTuples(ast.tuples);
  const literals = createLiteralRegistry([...convertLiterals(ast.literals), ...convertEnums(ast.enums)]);
  resolveObjectFields(models, objects, createObjectRegistry(objects), createTupleRegistry(tuples), literals);
  const registry = createRegistry(models);
  inferFKTypes(models, registry);

  return registry;
}

export function field(overrides: Partial<FieldMetadata>): FieldMetadata {
  return {
    name: 'test',
    type: 'string',
    isId: false,
    isUnique: false,
    isRequired: true,
    ...overrides,
  };
}

export function model(name: string, fields: FieldMetadata[]): ModelMetadata {
  return { name, tableName: name.toLowerCase(), fields };
}

export function elem(
  overrides: Partial<TupleElementMetadata> & { index: number; type: TupleElementMetadata['type'] },
): TupleElementMetadata {
  return {
    isOptional: false,
    ...overrides,
  };
}

export function tupleInfo(tupleName: string, elements: TupleElementMetadata[]): TupleFieldMetadata {
  return { tupleName, elements };
}

export function createModel(fields: FieldMetadata[], tableName = 'test'): ModelMetadata {
  return { name: tableName.charAt(0).toUpperCase() + tableName.slice(1), tableName, fields } as ModelMetadata;
}
