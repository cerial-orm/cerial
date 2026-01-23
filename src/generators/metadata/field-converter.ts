/**
 * Field converter - converts AST fields to FieldMetadata
 */

import type { ASTField, FieldMetadata } from '../../types';
import { hasDecorator, getDecorator } from '../../parser/types/ast';

/** Convert AST field to FieldMetadata */
export function convertField(field: ASTField): FieldMetadata {
  const defaultDecorator = getDecorator(field, 'default');

  return {
    name: field.name,
    type: field.type,
    isId: hasDecorator(field, 'id'),
    isUnique: hasDecorator(field, 'unique'),
    hasNowDefault: hasDecorator(field, 'now'),
    isRequired: !field.isOptional,
    defaultValue: defaultDecorator?.value,
  };
}

/** Convert multiple AST fields to FieldMetadata array */
export function convertFields(fields: ASTField[]): FieldMetadata[] {
  return fields.map(convertField);
}
