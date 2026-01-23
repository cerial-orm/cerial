/**
 * Model converter - converts AST models to ModelMetadata
 */

import type { ASTModel, ModelMetadata } from '../../types';
import { convertFields } from './field-converter';
import { toSnakeCase } from '../../utils/string-utils';

/** Convert AST model to ModelMetadata */
export function convertModel(model: ASTModel): ModelMetadata {
  return {
    name: model.name,
    tableName: toSnakeCase(model.name),
    fields: convertFields(model.fields),
  };
}

/** Convert multiple AST models to ModelMetadata array */
export function convertModels(models: ASTModel[]): ModelMetadata[] {
  return models.map(convertModel);
}
