/**
 * FK Type Inference Engine — infers recordIdTypes on FK Record fields
 * from the target model's @id field when paired with a Relation.
 */

import type { ModelMetadata, ModelRegistry } from '../../types/metadata.types';

/** Mutates models in-place: copies recordIdTypes from target @id to paired FK Record fields. */
export function inferFKTypes(models: ModelMetadata[], registry: ModelRegistry): void {
  for (const model of models) {
    const forwardRelations = model.fields.filter(
      (f) => f.type === 'relation' && f.relationInfo && !f.relationInfo.isReverse && f.relationInfo.fieldRef,
    );

    for (const relation of forwardRelations) {
      const fieldRef = relation.relationInfo!.fieldRef!;
      const targetModelName = relation.relationInfo!.targetModel;

      const fkField = model.fields.find((f) => f.name === fieldRef);
      if (!fkField) continue;
      if (fkField.type !== 'record') continue;
      if (fkField.isId) continue;
      if (fkField.recordIdTypes && fkField.recordIdTypes.length) continue;

      const targetModel = registry[targetModelName];
      if (!targetModel) continue;

      const targetIdField = targetModel.fields.find((f) => f.isId);
      if (!targetIdField) continue;

      if (targetIdField.recordIdTypes && targetIdField.recordIdTypes.length) {
        fkField.recordIdTypes = [...targetIdField.recordIdTypes];
      }
    }
  }
}
