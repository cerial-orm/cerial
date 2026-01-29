/**
 * Relation metadata utilities
 * Helpers for working with relation fields in the model registry
 */

import type { FieldMetadata, ModelMetadata, ModelRegistry } from '../types';

/** Get all Relation type fields from a model */
export function getRelationFields(model: ModelMetadata): FieldMetadata[] {
  return model.fields.filter((f) => f.type === 'relation');
}

/** Get all Record/Record[] type fields from a model */
export function getRecordFields(model: ModelMetadata): FieldMetadata[] {
  return model.fields.filter((f) => f.type === 'record');
}

/** Get forward relation fields (those with @field decorator) */
export function getForwardRelations(model: ModelMetadata): FieldMetadata[] {
  return model.fields.filter((f) => f.type === 'relation' && f.relationInfo && !f.relationInfo.isReverse);
}

/** Get reverse relation fields (those without @field decorator) */
export function getReverseRelations(model: ModelMetadata): FieldMetadata[] {
  return model.fields.filter((f) => f.type === 'relation' && f.relationInfo?.isReverse);
}

/** Get array Record fields (Record[]) */
export function getArrayRecordFields(model: ModelMetadata): FieldMetadata[] {
  return model.fields.filter((f) => f.type === 'record' && f.isArray);
}

/** Get single Record fields (non-array) */
export function getSingleRecordFields(model: ModelMetadata): FieldMetadata[] {
  return model.fields.filter((f) => f.type === 'record' && !f.isArray);
}

/**
 * Find the source Record field in target model for a reverse relation
 *
 * For reverse relation Profile.user Relation @model(User)
 * Find which Record field in User points to Profile
 */
export function findReverseSourceField(
  reverseField: FieldMetadata,
  currentModelName: string,
  registry: ModelRegistry,
): FieldMetadata | undefined {
  if (!reverseField.relationInfo?.isReverse) {
    return undefined;
  }

  const targetModelName = reverseField.relationInfo.targetModel;
  const targetModel = registry[targetModelName];
  if (!targetModel) {
    return undefined;
  }

  // Find a Record field in target that has a paired Relation pointing to currentModel
  for (const field of targetModel.fields) {
    if (field.type !== 'record') continue;

    // Check if there's a Relation with @field pointing to this Record
    // and @model pointing to currentModel
    const pairedRelation = targetModel.fields.find(
      (rel) =>
        rel.type === 'relation' &&
        rel.relationInfo?.fieldRef === field.name &&
        rel.relationInfo?.targetModel === currentModelName,
    );

    if (pairedRelation) {
      return field;
    }
  }

  return undefined;
}

/**
 * Get the paired Relation field for a Record field
 */
export function getPairedRelation(recordField: FieldMetadata, model: ModelMetadata): FieldMetadata | undefined {
  return model.fields.find((f) => f.type === 'relation' && f.relationInfo?.fieldRef === recordField.name);
}

/**
 * Validate all relation targets in registry
 * Returns array of validation errors
 */
export function validateRelationTargets(registry: ModelRegistry): string[] {
  const errors: string[] = [];

  for (const [modelName, model] of Object.entries(registry)) {
    for (const field of model.fields) {
      if (field.type !== 'relation' || !field.relationInfo) continue;

      const targetModel = field.relationInfo.targetModel;

      // Check if target model exists
      if (!registry[targetModel]) {
        errors.push(
          `Model "${modelName}": Relation field "${field.name}" references non-existent model "${targetModel}"`,
        );
        continue;
      }

      // For forward relations, check if the fieldRef exists
      if (!field.relationInfo.isReverse && field.relationInfo.fieldRef) {
        const fieldRef = field.relationInfo.fieldRef;
        const refField = model.fields.find((f) => f.name === fieldRef);

        if (!refField) {
          errors.push(
            `Model "${modelName}": Relation field "${field.name}" references non-existent field "${fieldRef}"`,
          );
        } else if (refField.type !== 'record') {
          errors.push(
            `Model "${modelName}": Relation field "${field.name}" references field "${fieldRef}" which is not a Record type`,
          );
        }
      }
    }
  }

  return errors;
}

/**
 * Check if a field is a relation that can be included in queries
 */
export function isIncludableRelation(field: FieldMetadata): boolean {
  return field.type === 'relation' && !!field.relationInfo;
}

/**
 * Get target model metadata for a relation field
 */
export function getRelationTargetModel(field: FieldMetadata, registry: ModelRegistry): ModelMetadata | undefined {
  if (!field.relationInfo) return undefined;
  return registry[field.relationInfo.targetModel];
}
