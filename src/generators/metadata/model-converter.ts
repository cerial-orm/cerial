/**
 * Model converter - converts AST models to ModelMetadata
 * Also converts AST objects to ObjectMetadata
 */

import type {
  ASTEnum,
  ASTLiteral,
  ASTLiteralVariant,
  ASTModel,
  ASTObject,
  ASTTuple,
  CompositeIndex,
  FieldMetadata,
  LiteralMetadata,
  LiteralRegistry,
  ModelMetadata,
  ObjectMetadata,
  ObjectRegistry,
  ResolvedLiteralVariant,
  TupleElementMetadata,
  TupleMetadata,
  TupleRegistry,
} from '../../types';
import { toSnakeCase } from '../../utils/string-utils';
import { convertFields } from './field-converter';

/** Convert AST model to ModelMetadata */
export function convertModel(model: ASTModel): ModelMetadata {
  const compositeDirectives: CompositeIndex[] = (model.directives ?? []).map((d) => ({
    kind: d.kind,
    name: d.name,
    fields: [...d.fields],
  }));

  return {
    name: model.name,
    tableName: toSnakeCase(model.name),
    fields: convertFields(model.fields),
    compositeDirectives,
  };
}

/** Convert multiple AST models to ModelMetadata array */
export function convertModels(models: ASTModel[]): ModelMetadata[] {
  return models.map(convertModel);
}

/** Convert AST object to ObjectMetadata */
export function convertObject(astObject: ASTObject): ObjectMetadata {
  return {
    name: astObject.name,
    fields: convertFields(astObject.fields),
  };
}

/** Convert multiple AST objects to ObjectMetadata array */
export function convertObjects(objects: ASTObject[]): ObjectMetadata[] {
  return objects.map(convertObject);
}

/**
 * Resolve inline object fields and tuple elements across models, objects, and tuples.
 * After conversion, objectInfo.fields and tupleInfo.elements are empty.
 * This function populates them with actual field/element data from the registries,
 * enabling runtime query builders to access sub-field structure.
 *
 * Must be called after all objects and tuples are converted.
 */
export function resolveObjectFields(
  models: ModelMetadata[],
  objects: ObjectMetadata[],
  objectRegistry: ObjectRegistry,
  tupleRegistry?: TupleRegistry,
  literalRegistry?: LiteralRegistry,
): void {
  // Resolve literal variant tuple/object info from registries
  if (literalRegistry) {
    resolveLiteralVariants(literalRegistry, objectRegistry, tupleRegistry);
  }

  // Resolve fields on all model fields
  for (const model of models) {
    resolveFieldsRecursive(model.fields, objectRegistry, tupleRegistry);
    if (literalRegistry) resolveLiteralFields(model.fields, literalRegistry);
  }

  // Resolve fields on all object fields (for nested objects and tuples inside objects)
  for (const object of objects) {
    resolveFieldsRecursive(object.fields, objectRegistry, tupleRegistry);
    if (literalRegistry) resolveLiteralFields(object.fields, literalRegistry);
  }

  // Resolve elements on all tuple elements (for nested tuples and objects inside tuples)
  if (tupleRegistry) {
    for (const tupleName of Object.keys(tupleRegistry)) {
      const tupleMeta = tupleRegistry[tupleName]!;
      resolveTupleElementsRecursive(tupleMeta.elements, objectRegistry, tupleRegistry);
      // Resolve literal-typed tuple elements
      if (literalRegistry) {
        for (const el of tupleMeta.elements) {
          if (el.type === 'literal' && el.literalInfo && !el.literalInfo.variants.length) {
            const litMeta = literalRegistry[el.literalInfo.literalName];
            if (litMeta) {
              el.literalInfo.variants = JSON.parse(JSON.stringify(litMeta.variants));
              if (litMeta.isEnum) el.literalInfo.isEnum = true;
            }
          }
        }
      }
    }
  }
}

/** Convert AST tuple element to TupleElementMetadata */
function convertTupleElement(element: import('../../types').ASTTupleElement, index: number): TupleElementMetadata {
  const metadata: TupleElementMetadata = {
    index,
    type: element.type,
    isOptional: element.isOptional,
  };

  if (element.name) metadata.name = element.name;
  if (element.isNullable) metadata.isNullable = true;

  // Handle decorators on tuple elements
  if (element.decorators?.length) {
    for (const dec of element.decorators) {
      if (dec.type === 'default') metadata.defaultValue = dec.value;
      if (dec.type === 'defaultAlways') metadata.defaultAlwaysValue = dec.value;
      if (dec.type === 'createdAt') metadata.timestampDecorator = 'createdAt';
      if (dec.type === 'updatedAt') metadata.timestampDecorator = 'updatedAt';
    }
  }

  if (element.type === 'object' && element.objectName) {
    metadata.objectInfo = { objectName: element.objectName, fields: [] };
  }
  if (element.type === 'tuple' && element.tupleName) {
    metadata.tupleInfo = { tupleName: element.tupleName, elements: [] };
  }
  if (element.type === 'literal' && element.literalName) {
    metadata.literalInfo = { literalName: element.literalName, variants: [] };
  }

  return metadata;
}

/** Convert AST tuple to TupleMetadata */
export function convertTuple(astTuple: ASTTuple): TupleMetadata {
  return {
    name: astTuple.name,
    elements: astTuple.elements.map((e, i) => convertTupleElement(e, i)),
  };
}

/** Convert multiple AST tuples to TupleMetadata array */
export function convertTuples(tuples: ASTTuple[]): TupleMetadata[] {
  return tuples.map(convertTuple);
}

/** Create TupleRegistry object from tuples */
export function createTupleRegistry(tuples: TupleMetadata[]): TupleRegistry {
  const registry: TupleRegistry = {};

  for (const tuple of tuples) {
    registry[tuple.name] = tuple;
  }

  return registry;
}

/**
 * Expand literal references and resolve AST literal variants to ResolvedLiteralVariant[].
 * Recursively expands literalRef variants and deduplicates.
 */
function expandLiteralVariants(
  variants: ASTLiteralVariant[],
  allLiterals: ASTLiteral[],
  visited: Set<string> = new Set(),
): ResolvedLiteralVariant[] {
  const result: ResolvedLiteralVariant[] = [];
  const seen = new Set<string>();

  for (const v of variants) {
    if (v.kind === 'literalRef') {
      if (visited.has(v.literalName)) continue;
      const refLiteral = allLiterals.find((l) => l.name === v.literalName);
      if (!refLiteral) continue;
      const nextVisited = new Set(visited);
      nextVisited.add(v.literalName);
      const expanded = expandLiteralVariants(refLiteral.variants, allLiterals, nextVisited);
      for (const ev of expanded) {
        const key = variantKey(ev);
        if (!seen.has(key)) {
          seen.add(key);
          result.push(ev);
        }
      }
    } else {
      let resolved: ResolvedLiteralVariant;
      if (v.kind === 'tupleRef') {
        resolved = { kind: 'tupleRef', tupleName: v.tupleName, tupleInfo: { tupleName: v.tupleName, elements: [] } };
      } else if (v.kind === 'objectRef') {
        resolved = {
          kind: 'objectRef',
          objectName: v.objectName,
          objectInfo: { objectName: v.objectName, fields: [] },
        };
      } else {
        resolved = v as ResolvedLiteralVariant;
      }
      const key = variantKey(resolved);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(resolved);
      }
    }
  }

  return result;
}

/** Get a unique key for a literal variant (for deduplication) */
function variantKey(v: ResolvedLiteralVariant): string {
  switch (v.kind) {
    case 'string':
      return `string:${v.value}`;
    case 'int':
      return `int:${v.value}`;
    case 'float':
      return `float:${v.value}`;
    case 'bool':
      return `bool:${v.value}`;
    case 'broadType':
      return `broadType:${v.typeName}`;
    case 'tupleRef':
      return `tupleRef:${v.tupleName}`;
    case 'objectRef':
      return `objectRef:${v.objectName}`;
  }
}

/** Convert AST literal to LiteralMetadata (resolves literal references) */
export function convertLiteral(astLiteral: ASTLiteral, allLiterals: ASTLiteral[]): LiteralMetadata {
  const variants = expandLiteralVariants(astLiteral.variants, allLiterals, new Set([astLiteral.name]));

  return { name: astLiteral.name, variants };
}

/** Convert multiple AST literals to LiteralMetadata array */
export function convertLiterals(literals: ASTLiteral[]): LiteralMetadata[] {
  return literals.map((l) => convertLiteral(l, literals));
}

/** Convert AST enums to LiteralMetadata with isEnum flag */
export function convertEnums(enums: ASTEnum[], _allLiterals: ASTLiteral[] = []): LiteralMetadata[] {
  return enums.map((e) => ({
    name: e.name,
    variants: e.values.map((v) => ({ kind: 'string' as const, value: v })),
    isEnum: true,
  }));
}

/** Create LiteralRegistry object from literals */
export function createLiteralRegistry(literals: LiteralMetadata[]): LiteralRegistry {
  const registry: LiteralRegistry = {};
  for (const lit of literals) {
    registry[lit.name] = lit;
  }

  return registry;
}

/** Resolve tuple/object info on literal variants from registries */
export function resolveLiteralVariants(
  literalRegistry: LiteralRegistry,
  objectRegistry: ObjectRegistry,
  tupleRegistry?: TupleRegistry,
): void {
  for (const litName of Object.keys(literalRegistry)) {
    const lit = literalRegistry[litName]!;
    for (const v of lit.variants) {
      if (v.kind === 'tupleRef' && tupleRegistry) {
        const tupleMeta = tupleRegistry[v.tupleName];
        if (tupleMeta) {
          v.tupleInfo = { tupleName: v.tupleName, elements: JSON.parse(JSON.stringify(tupleMeta.elements)) };
        }
      }
      if (v.kind === 'objectRef') {
        const objectMeta = objectRegistry[v.objectName];
        if (objectMeta) {
          v.objectInfo = { objectName: v.objectName, fields: JSON.parse(JSON.stringify(objectMeta.fields)) };
        }
      }
    }
  }
}

/** Resolve literalInfo.variants on fields that reference literals */
function resolveLiteralFields(fields: FieldMetadata[], literalRegistry: LiteralRegistry): void {
  for (const field of fields) {
    if (field.type === 'literal' && field.literalInfo && !field.literalInfo.variants.length) {
      const litMeta = literalRegistry[field.literalInfo.literalName];
      if (litMeta) {
        field.literalInfo.variants = JSON.parse(JSON.stringify(litMeta.variants));
        if (litMeta.isEnum) field.literalInfo.isEnum = true;
      }
    }
  }
}

/** Recursively resolve objectInfo.fields and tupleInfo.elements on a field list */
function resolveFieldsRecursive(
  fields: FieldMetadata[],
  objectRegistry: ObjectRegistry,
  tupleRegistry?: TupleRegistry,
  visited: Set<string> = new Set(),
): void {
  for (const field of fields) {
    if (field.type === 'object' && field.objectInfo && !field.objectInfo.fields.length) {
      const objectName = field.objectInfo.objectName;

      // Cycle detection: skip self-referencing / circular objects
      if (visited.has(objectName)) continue;

      const objectMeta = objectRegistry[objectName];
      if (objectMeta) {
        // Deep clone the fields to avoid shared references
        field.objectInfo.fields = JSON.parse(JSON.stringify(objectMeta.fields));
        // Recursively resolve nested object fields (track visited to prevent cycles)
        const nextVisited = new Set(visited);
        nextVisited.add(objectName);
        resolveFieldsRecursive(field.objectInfo.fields, objectRegistry, tupleRegistry, nextVisited);
      }
    }

    // Resolve tuple fields
    if (field.type === 'tuple' && field.tupleInfo && !field.tupleInfo.elements.length && tupleRegistry) {
      const tupleName = field.tupleInfo.tupleName;

      // Cycle detection
      if (visited.has(`tuple:${tupleName}`)) continue;

      const tupleMeta = tupleRegistry[tupleName];
      if (tupleMeta) {
        field.tupleInfo.elements = JSON.parse(JSON.stringify(tupleMeta.elements));
        const nextVisited = new Set(visited);
        nextVisited.add(`tuple:${tupleName}`);
        resolveTupleElementsRecursive(field.tupleInfo.elements, objectRegistry, tupleRegistry, nextVisited);
      }
    }
  }
}

/** Recursively resolve tuple elements' nested objectInfo and tupleInfo */
function resolveTupleElementsRecursive(
  elements: TupleElementMetadata[],
  objectRegistry: ObjectRegistry,
  tupleRegistry: TupleRegistry,
  visited: Set<string> = new Set(),
): void {
  for (const element of elements) {
    // Resolve object elements
    if (element.type === 'object' && element.objectInfo && !element.objectInfo.fields.length) {
      const objectName = element.objectInfo.objectName;
      if (visited.has(objectName)) continue;

      const objectMeta = objectRegistry[objectName];
      if (objectMeta) {
        element.objectInfo.fields = JSON.parse(JSON.stringify(objectMeta.fields));
        const nextVisited = new Set(visited);
        nextVisited.add(objectName);
        resolveFieldsRecursive(element.objectInfo.fields, objectRegistry, tupleRegistry, nextVisited);
      }
    }

    // Resolve nested tuple elements
    if (element.type === 'tuple' && element.tupleInfo && !element.tupleInfo.elements.length) {
      const tupleName = element.tupleInfo.tupleName;
      if (visited.has(`tuple:${tupleName}`)) continue;

      const tupleMeta = tupleRegistry[tupleName];
      if (tupleMeta) {
        element.tupleInfo.elements = JSON.parse(JSON.stringify(tupleMeta.elements));
        const nextVisited = new Set(visited);
        nextVisited.add(`tuple:${tupleName}`);
        resolveTupleElementsRecursive(element.tupleInfo.elements, objectRegistry, tupleRegistry, nextVisited);
      }
    }
  }
}
