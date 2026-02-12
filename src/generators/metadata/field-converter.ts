/**
 * Field converter - converts AST fields to FieldMetadata
 */

import { getDecorator, hasDecorator } from '../../parser/types/ast';
import type { ASTField, FieldMetadata, RelationFieldMetadata } from '../../types';
import { toSnakeCase } from '../../utils/string-utils';

/** Resolve the timestamp decorator from an AST field */
function resolveTimestampDecorator(field: ASTField): 'now' | 'createdAt' | 'updatedAt' | undefined {
  if (hasDecorator(field, 'now')) return 'now';
  if (hasDecorator(field, 'createdAt')) return 'createdAt';
  if (hasDecorator(field, 'updatedAt')) return 'updatedAt';

  return undefined;
}

/** Convert AST field to FieldMetadata */
export function convertField(field: ASTField): FieldMetadata {
  const defaultDecorator = getDecorator(field, 'default');
  const defaultAlwaysDecorator = getDecorator(field, 'defaultAlways');
  const isId = hasDecorator(field, 'id');
  const timestampDec = resolveTimestampDecorator(field);
  const hasDefaultAlways = defaultAlwaysDecorator !== undefined;

  const metadata: FieldMetadata = {
    name: field.name,
    type: field.type,
    isId,
    isUnique: isId || hasDecorator(field, 'unique'),
    isIndexed: hasDecorator(field, 'index'),
    timestampDecorator: timestampDec,
    isRequired: !isId && !timestampDec && !hasDefaultAlways && !field.isOptional,
    defaultValue: defaultDecorator?.value,
    defaultAlwaysValue: defaultAlwaysDecorator?.value,
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

  // Handle @flexible decorator
  if (hasDecorator(field, 'flexible')) {
    metadata.isFlexible = true;
  }

  // Handle object type (fields will be resolved later by resolveObjectFields)
  if (field.type === 'object' && field.objectName) {
    metadata.objectInfo = { objectName: field.objectName, fields: [] };
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
        relationInfo.onDelete = onDeleteDecorator.value as 'Cascade' | 'SetNull' | 'Restrict' | 'NoAction';
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

/** Convert multiple AST fields to FieldMetadata array */
export function convertFields(fields: ASTField[]): FieldMetadata[] {
  return fields.map(convertField);
}
