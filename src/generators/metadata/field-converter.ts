/**
 * Field converter - converts AST fields to FieldMetadata
 */

import type { ASTField, FieldMetadata } from '../../types';
import { hasDecorator, getDecorator } from '../../parser/types/ast';

/** Convert AST field to FieldMetadata */
export function convertField(field: ASTField): FieldMetadata {
  const defaultDecorator = getDecorator(field, 'default');
  const isId = hasDecorator(field, 'id');
  const hasNow = hasDecorator(field, 'now');

  return {
    name: field.name,
    type: field.type,
    isId,
    isUnique: isId || hasDecorator(field, 'unique'),
    hasNowDefault: hasNow,
    isRequired: !isId && !hasNow && !field.isOptional,
    defaultValue: defaultDecorator?.value,
  };
}

/** Convert multiple AST fields to FieldMetadata array */
export function convertFields(fields: ASTField[]): FieldMetadata[] {
  return fields.map(convertField);
}
