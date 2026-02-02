/**
 * Field converter - converts AST fields to FieldMetadata
 */

import { getDecorator, hasDecorator } from '../../parser/types/ast';
import type { ASTField, FieldMetadata, RelationFieldMetadata } from '../../types';
import { toSnakeCase } from '../../utils/string-utils';

/** Convert AST field to FieldMetadata */
export function convertField(field: ASTField): FieldMetadata {
  const defaultDecorator = getDecorator(field, 'default');
  const isId = hasDecorator(field, 'id');
  const hasNow = hasDecorator(field, 'now');

  const metadata: FieldMetadata = {
    name: field.name,
    type: field.type,
    isId,
    isUnique: isId || hasDecorator(field, 'unique'),
    hasNowDefault: hasNow,
    isRequired: !isId && !hasNow && !field.isOptional,
    defaultValue: defaultDecorator?.value,
  };

  // Handle array type (Record[])
  if (field.isArray) {
    metadata.isArray = true;
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
