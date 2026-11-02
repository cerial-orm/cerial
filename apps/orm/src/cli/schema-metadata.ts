import {
  convertLiterals,
  convertModels,
  convertObjects,
  convertTuples,
  createLiteralRegistry,
  createObjectRegistry,
  createRegistry,
  createTupleRegistry,
  inferFKTypes,
  resolveObjectFields,
} from '../generators/metadata';
import type {
  ASTLiteral,
  ASTLiteralVariant,
  LiteralMetadata,
  LiteralRegistry,
  ModelMetadata,
  ModelRegistry,
  ObjectMetadata,
  ObjectRegistry,
  SchemaAST,
  TupleMetadata,
  TupleRegistry,
} from '../types';

export interface SchemaMetadata {
  readonly models: ModelMetadata[];
  readonly objects: ObjectMetadata[];
  readonly tuples: TupleMetadata[];
  readonly literals: LiteralMetadata[];
  readonly objectRegistry: ObjectRegistry | undefined;
  readonly tupleRegistry: TupleRegistry | undefined;
  readonly literalRegistry: LiteralRegistry | undefined;
  readonly modelRegistry: ModelRegistry;
}

/**
 * Turn a resolved AST into the metadata every generator and the migrate command read. One function, so the
 * schema `migrate` plans against is the one the generated client fingerprints. Abstract models are dropped,
 * enums become literals, and object, tuple and literal fields are resolved before foreign key types are inferred.
 */
export function buildSchemaMetadata(ast: SchemaAST): SchemaMetadata {
  const models = convertModels(ast.models.filter((model) => !model.abstract));
  const objects = convertObjects(ast.objects);
  const tuples = convertTuples(ast.tuples);

  // Enums go through the literal pipeline as synthetic literals
  const syntheticEnumLiterals: ASTLiteral[] = ast.enums.map((e) => ({
    name: e.name,
    variants: e.values.map((v): ASTLiteralVariant => ({ kind: 'string', value: v })),
    range: e.range,
    origin: e.origin,
  }));
  const literals = convertLiterals([...ast.literals, ...syntheticEnumLiterals]);
  for (const lit of literals) {
    if (ast.enums.some((e) => e.name === lit.name)) lit.isEnum = true;
  }

  const objectRegistry = objects.length ? createObjectRegistry(objects) : undefined;
  const tupleRegistry = tuples.length ? createTupleRegistry(tuples) : undefined;
  const literalRegistry = literals.length ? createLiteralRegistry(literals) : undefined;
  if (objects.length || tuples.length || literals.length) {
    resolveObjectFields(models, objects, objectRegistry ?? {}, tupleRegistry, literalRegistry);
  }

  const modelRegistry = createRegistry(models);
  inferFKTypes(models, modelRegistry);

  return { models, objects, tuples, literals, objectRegistry, tupleRegistry, literalRegistry, modelRegistry };
}
