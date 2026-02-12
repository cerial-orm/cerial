/**
 * Model metadata conversion
 * Converts AST to runtime metadata
 */

import type {
  ASTField,
  ASTModel,
  CompositeIndex,
  FieldMetadata,
  ModelMetadata,
  ModelRegistry,
  RelationFieldMetadata,
  SchemaAST,
} from '../types';
import { toSnakeCase } from '../utils/string-utils';
import { getDecorator, hasDecorator } from './types/ast';

/** Resolve the timestamp decorator from an AST field */
function resolveTimestampDecorator(field: ASTField): 'now' | 'createdAt' | 'updatedAt' | undefined {
  if (hasDecorator(field, 'now')) return 'now';
  if (hasDecorator(field, 'createdAt')) return 'createdAt';
  if (hasDecorator(field, 'updatedAt')) return 'updatedAt';

  return undefined;
}

/** Convert AST field to FieldMetadata */
export function fieldToMetadata(field: ASTField): FieldMetadata {
  const metadata: FieldMetadata = {
    name: field.name,
    type: field.type,
    isId: hasDecorator(field, 'id'),
    isUnique: hasDecorator(field, 'unique'),
    isIndexed: hasDecorator(field, 'index'),
    timestampDecorator: resolveTimestampDecorator(field),
    isRequired: !field.isOptional,
    defaultValue: getDecorator(field, 'default')?.value,
  };

  // Handle array type (Record[])
  if (field.isArray) {
    metadata.isArray = true;
  }

  // Handle @distinct decorator
  if (hasDecorator(field, 'distinct')) {
    metadata.isDistinct = true;
  }

  // Handle @sort decorator
  const sortDecorator = getDecorator(field, 'sort');
  if (sortDecorator) {
    // value is boolean: true = asc, false = desc (default true)
    metadata.sortOrder = sortDecorator.value === false ? 'desc' : 'asc';
  }

  // Handle relation type
  if (field.type === 'relation') {
    const modelDecorator = getDecorator(field, 'model');
    const fieldDecorator = getDecorator(field, 'field');
    const onDeleteDecorator = getDecorator(field, 'onDelete');
    const keyDecorator = getDecorator(field, 'key');

    if (modelDecorator?.value) {
      const targetModel = modelDecorator.value as string;
      const relationInfo: RelationFieldMetadata = {
        targetModel,
        targetTable: toSnakeCase(targetModel),
        isReverse: !fieldDecorator, // Reverse if no @field decorator
      };

      // Add field reference if forward relation
      if (fieldDecorator?.value) {
        relationInfo.fieldRef = fieldDecorator.value as string;
      }

      // Add onDelete action if specified
      if (onDeleteDecorator?.value) {
        relationInfo.onDelete = onDeleteDecorator.value as RelationFieldMetadata['onDelete'];
      }

      // Add key for disambiguation if specified
      if (keyDecorator?.value) {
        relationInfo.key = keyDecorator.value as string;
      }

      metadata.relationInfo = relationInfo;
    }
  }

  return metadata;
}

/** Convert AST model to ModelMetadata */
export function modelToMetadata(model: ASTModel): ModelMetadata {
  const compositeDirectives: CompositeIndex[] = (model.directives ?? []).map((d) => ({
    kind: d.kind,
    name: d.name,
    fields: [...d.fields],
  }));

  return {
    name: model.name,
    tableName: toSnakeCase(model.name),
    fields: model.fields.map(fieldToMetadata),
    compositeDirectives,
  };
}

/** Convert SchemaAST to ModelRegistry */
export function astToRegistry(ast: SchemaAST): ModelRegistry {
  const registry: ModelRegistry = {};

  for (const model of ast.models) {
    registry[model.name] = modelToMetadata(model);
  }

  return registry;
}

/** Get a model metadata by name */
export function getModelMetadata(registry: ModelRegistry, name: string): ModelMetadata | undefined {
  return registry[name];
}

/** Get a field metadata by name from a model */
export function getFieldMetadata(model: ModelMetadata, fieldName: string): FieldMetadata | undefined {
  return model.fields.find((f) => f.name === fieldName);
}

/** Check if a model has a field */
export function hasField(model: ModelMetadata, fieldName: string): boolean {
  return model.fields.some((f) => f.name === fieldName);
}

/** Get unique fields from a model */
export function getUniqueFields(model: ModelMetadata): FieldMetadata[] {
  return model.fields.filter((f) => f.isUnique);
}

/** Get required fields from a model */
export function getRequiredFields(model: ModelMetadata): FieldMetadata[] {
  return model.fields.filter((f) => f.isRequired);
}

/** Get optional fields from a model */
export function getOptionalFields(model: ModelMetadata): FieldMetadata[] {
  return model.fields.filter((f) => !f.isRequired);
}

/** Get fields with any timestamp decorator (@now, @createdAt, @updatedAt) */
export function getTimestampFields(model: ModelMetadata): FieldMetadata[] {
  return model.fields.filter((f) => f.timestampDecorator);
}

/** Get fields with default values (includes @createdAt and @updatedAt but not @now which is computed) */
export function getFieldsWithDefaults(model: ModelMetadata): FieldMetadata[] {
  return model.fields.filter(
    (f) => f.defaultValue !== undefined || f.timestampDecorator === 'createdAt' || f.timestampDecorator === 'updatedAt',
  );
}
