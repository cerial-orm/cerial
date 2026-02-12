/**
 * Model converter - converts AST models to ModelMetadata
 * Also converts AST objects to ObjectMetadata
 */

import type {
  ASTModel,
  ASTObject,
  CompositeIndex,
  FieldMetadata,
  ModelMetadata,
  ObjectMetadata,
  ObjectRegistry,
} from '../../types';
import { convertFields } from './field-converter';
import { toSnakeCase } from '../../utils/string-utils';

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
 * Resolve inline object fields on all objectInfo across models and objects.
 * After conversion, objectInfo.fields is empty. This function populates it
 * with the actual fields from the referenced object, enabling runtime query
 * builders to access sub-field structure without needing the full ObjectRegistry.
 *
 * Must be called after all objects are converted.
 */
export function resolveObjectFields(
  models: ModelMetadata[],
  objects: ObjectMetadata[],
  objectRegistry: ObjectRegistry,
): void {
  // Resolve fields on all model fields
  for (const model of models) {
    resolveFieldsRecursive(model.fields, objectRegistry);
  }

  // Resolve fields on all object fields (for nested objects)
  for (const object of objects) {
    resolveFieldsRecursive(object.fields, objectRegistry);
  }
}

/** Recursively resolve objectInfo.fields on a field list */
function resolveFieldsRecursive(
  fields: FieldMetadata[],
  objectRegistry: ObjectRegistry,
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
        resolveFieldsRecursive(field.objectInfo.fields, objectRegistry, nextVisited);
      }
    }
  }
}
