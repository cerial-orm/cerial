/**
 * Relation validator - validates relation field rules
 *
 * Validation Rules:
 * 1. PK structure: Relation @field requires paired Record field
 * 2. Non-PK validation: Reverse relation requires PK side in target model
 * 3. Single-sided optional: If non-PK not defined, Record and Relation must be optional
 * 4. n-n completeness: Both models must have Record[] + Relation[] for true n-n
 * 5. @onDelete placement: Only on optional Relation (not required, not array)
 * 6. Required cascade: Required relations auto-cascade, @onDelete not allowed
 * 7. Cardinality match: Record[] with Relation[], Record with Relation
 * 8. @key required: Multiple relations to same model need @key
 * 9. @key pairing: Forward and reverse must share same @key
 * 10. @key uniqueness: @key value unique per model pair
 */

import { getDecorator, hasDecorator } from '../../parser/types/ast';
import type { ASTField, ASTModel, SchemaAST } from '../../types';
import type { SchemaValidationError } from './schema-validator';

/** Get relation info from a field */
interface RelationInfo {
  field: ASTField;
  model: ASTModel;
  targetModel: string;
  fieldRef?: string;
  isReverse: boolean;
  isArray: boolean;
  isOptional: boolean;
  onDelete?: string;
  key?: string;
}

/** Extract relation info from a field */
function getRelationInfo(field: ASTField, model: ASTModel): RelationInfo | null {
  if (field.type !== 'relation') return null;

  const modelDecorator = getDecorator(field, 'model');
  if (!modelDecorator?.value) return null;

  const fieldDecorator = getDecorator(field, 'field');
  const onDeleteDecorator = getDecorator(field, 'onDelete');
  const keyDecorator = getDecorator(field, 'key');

  return {
    field,
    model,
    targetModel: modelDecorator.value as string,
    fieldRef: fieldDecorator?.value as string | undefined,
    isReverse: !fieldDecorator,
    isArray: !!field.isArray,
    isOptional: field.isOptional,
    onDelete: onDeleteDecorator?.value as string | undefined,
    key: keyDecorator?.value as string | undefined,
  };
}

/** Get all relations from AST */
function getAllRelations(ast: SchemaAST): RelationInfo[] {
  const relations: RelationInfo[] = [];

  for (const model of ast.models) {
    for (const field of model.fields) {
      const info = getRelationInfo(field, model);
      if (info) relations.push(info);
    }
  }

  return relations;
}

/** Get Record field by name from a model */
function getRecordField(model: ASTModel, fieldName: string): ASTField | undefined {
  return model.fields.find((f) => f.name === fieldName && f.type === 'record');
}

/** Check if a model has Record[] + Relation[] pointing to target */
function hasArrayPKSide(model: ASTModel, targetModelName: string): boolean {
  for (const field of model.fields) {
    if (field.type !== 'relation' || !field.isArray) continue;

    const modelDecorator = getDecorator(field, 'model');
    const fieldDecorator = getDecorator(field, 'field');

    if (modelDecorator?.value === targetModelName && fieldDecorator) {
      // Has Relation[] @field pointing to target, check if Record[] exists
      const recordField = getRecordField(model, fieldDecorator.value as string);
      if (recordField?.isArray) return true;
    }
  }

  return false;
}

/**
 * Rule 1: PK structure - Relation @field requires paired Record field
 */
export function validatePKStructure(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  for (const model of ast.models) {
    for (const field of model.fields) {
      if (field.type !== 'relation') continue;

      const fieldDecorator = getDecorator(field, 'field');
      if (!fieldDecorator) continue; // Reverse relation, skip

      const fieldRef = fieldDecorator.value as string;
      const recordField = getRecordField(model, fieldRef);

      if (!recordField) {
        errors.push({
          message: `Relation field "${field.name}" references non-existent Record field "${fieldRef}"`,
          model: model.name,
          field: field.name,
          line: field.range.start.line,
        });
      }
    }
  }

  return errors;
}

/**
 * Rule 2: Non-PK validation - Reverse relation requires PK side in target model
 */
export function validateNonPKSide(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const modelMap = new Map(ast.models.map((m) => [m.name, m]));

  for (const model of ast.models) {
    for (const field of model.fields) {
      if (field.type !== 'relation') continue;

      const fieldDecorator = getDecorator(field, 'field');
      if (fieldDecorator) continue; // Forward relation, skip

      const modelDecorator = getDecorator(field, 'model');
      const targetModelName = modelDecorator?.value as string;
      if (!targetModelName) continue;

      const targetModel = modelMap.get(targetModelName);
      if (!targetModel) continue; // Target doesn't exist, handled elsewhere

      const keyDecorator = getDecorator(field, 'key');
      const key = keyDecorator?.value as string | undefined;

      // Find PK side in target model that points back to this model
      const hasPKSide = targetModel.fields.some((f) => {
        if (f.type !== 'relation') return false;

        const fModelDecorator = getDecorator(f, 'model');
        const fFieldDecorator = getDecorator(f, 'field');
        const fKeyDecorator = getDecorator(f, 'key');

        if (fModelDecorator?.value !== model.name) return false;
        if (!fFieldDecorator) return false; // Must be PK side (has @field)

        // If key is specified, keys must match
        if (key) {
          return fKeyDecorator?.value === key;
        }

        // If no key on reverse, PK side must also have no key (or be the only relation)
        return true;
      });

      if (!hasPKSide) {
        const keyInfo = key ? ` with @key(${key})` : '';
        errors.push({
          message: `Reverse relation "${field.name}"${keyInfo} requires PK side (Record + Relation @field) in model "${targetModelName}"`,
          model: model.name,
          field: field.name,
          line: field.range.start.line,
        });
      }
    }
  }

  return errors;
}

/**
 * Rule 3: Single-sided optional - If non-PK not defined, Record and Relation must be optional
 * Exception: Array relations (Record[] + Relation[]) don't require optionality - one-directional many is valid
 */
export function validateSingleSidedOptional(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const modelMap = new Map(ast.models.map((m) => [m.name, m]));

  for (const model of ast.models) {
    for (const field of model.fields) {
      if (field.type !== 'relation') continue;

      const fieldDecorator = getDecorator(field, 'field');
      if (!fieldDecorator) continue; // Reverse relation, skip

      // Array relations don't need to be optional - one-directional many is valid
      // Arrays default to [] and cleanup is automatic when referenced records are deleted
      if (field.isArray) continue;

      const modelDecorator = getDecorator(field, 'model');
      const targetModelName = modelDecorator?.value as string;
      if (!targetModelName) continue;

      const targetModel = modelMap.get(targetModelName);
      if (!targetModel) continue;

      const keyDecorator = getDecorator(field, 'key');
      const key = keyDecorator?.value as string | undefined;

      // Check if target has any relation back to this model (reverse OR forward for n-n)
      const hasRelationBack = targetModel.fields.some((f) => {
        if (f.type !== 'relation') return false;

        const fModelDecorator = getDecorator(f, 'model');
        const fKeyDecorator = getDecorator(f, 'key');

        if (fModelDecorator?.value !== model.name) return false;

        // If key is specified, keys must match
        if (key) return fKeyDecorator?.value === key;

        return true;
      });

      // Self-referential relations are a special case
      const isSelfRef = targetModelName === model.name;

      // For self-ref with no reverse lookup (single-sided), optional is not required
      // User can manually query reverse
      if (isSelfRef && !hasRelationBack) {
        // Single-sided self-ref is allowed without optionality requirement
        // because user will manually query reverse
        continue;
      }

      // For non-self-ref single-sided (no relation back defined in target), must be optional
      // Note: For n-n, both sides have forward relations, so hasRelationBack will be true
      if (!hasRelationBack && !isSelfRef) {
        if (!field.isOptional) {
          errors.push({
            message: `Single-sided relation "${field.name}" must be optional (Relation?) because no reverse is defined in "${targetModelName}"`,
            model: model.name,
            field: field.name,
            line: field.range.start.line,
          });
        }

        // Also check the Record field
        const fieldRef = fieldDecorator.value as string;
        const recordField = model.fields.find((f) => f.name === fieldRef);
        if (recordField && !recordField.isOptional) {
          errors.push({
            message: `Single-sided relation's Record field "${fieldRef}" must be optional (Record?) because no reverse is defined in "${targetModelName}"`,
            model: model.name,
            field: fieldRef,
            line: recordField.range.start.line,
          });
        }
      }
    }
  }

  return errors;
}

/**
 * Rule 4: n-n completeness - Both models must have Record[] + Relation[] for true n-n
 * Note: One-directional many (only one side has Record[]) is allowed but doesn't get bidirectional sync
 */
export function validateNToNCompleteness(ast: SchemaAST): SchemaValidationError[] {
  // This is informational - one-directional many is valid
  // We don't enforce both sides, just detect true n-n for sync purposes
  return [];
}

/**
 * Rule 5: @onDelete placement - Only on optional Relation (not required, not array)
 */
export function validateOnDeletePlacement(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  for (const model of ast.models) {
    for (const field of model.fields) {
      if (field.type !== 'relation') continue;

      const onDeleteDecorator = getDecorator(field, 'onDelete');
      if (!onDeleteDecorator) continue;

      // @onDelete only allowed on optional singular relations
      if (!field.isOptional) {
        errors.push({
          message: `@onDelete is only allowed on optional relations. "${field.name}" is required - required relations auto-cascade on delete`,
          model: model.name,
          field: field.name,
          line: field.range.start.line,
        });
      }

      if (field.isArray) {
        errors.push({
          message: `@onDelete is not allowed on array relations. "${field.name}" is Relation[] - array relations auto-cleanup on delete`,
          model: model.name,
          field: field.name,
          line: field.range.start.line,
        });
      }

      // @onDelete only makes sense on forward relations (PK side)
      const fieldDecorator = getDecorator(field, 'field');
      if (!fieldDecorator) {
        errors.push({
          message: `@onDelete is only allowed on forward relations (with @field). "${field.name}" is a reverse relation`,
          model: model.name,
          field: field.name,
          line: field.range.start.line,
        });
      }
    }
  }

  return errors;
}

/**
 * Rule 7: Cardinality match - Record[] with Relation[], Record with Relation
 */
export function validateCardinalityMatch(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  for (const model of ast.models) {
    for (const field of model.fields) {
      if (field.type !== 'relation') continue;

      const fieldDecorator = getDecorator(field, 'field');
      if (!fieldDecorator) continue; // Reverse relation, skip

      const fieldRef = fieldDecorator.value as string;
      const recordField = model.fields.find((f) => f.name === fieldRef);
      if (!recordField) continue; // Missing Record, handled by rule 1

      // Check cardinality match
      const relationIsArray = !!field.isArray;
      const recordIsArray = !!recordField.isArray;

      if (relationIsArray !== recordIsArray) {
        if (relationIsArray && !recordIsArray) {
          errors.push({
            message: `Cardinality mismatch: Relation[] "${field.name}" must pair with Record[] but "${fieldRef}" is Record`,
            model: model.name,
            field: field.name,
            line: field.range.start.line,
          });
        } else {
          errors.push({
            message: `Cardinality mismatch: Relation "${field.name}" must pair with Record but "${fieldRef}" is Record[]`,
            model: model.name,
            field: field.name,
            line: field.range.start.line,
          });
        }
      }

      // Check optionality match for non-array
      if (!relationIsArray && !recordIsArray) {
        const relationIsOptional = field.isOptional;
        const recordIsOptional = recordField.isOptional;

        if (relationIsOptional !== recordIsOptional) {
          errors.push({
            message: `Optionality mismatch: Relation${relationIsOptional ? '?' : ''} "${field.name}" must match Record${recordIsOptional ? '?' : ''} "${fieldRef}"`,
            model: model.name,
            field: field.name,
            line: field.range.start.line,
          });
        }
      }
    }
  }

  return errors;
}

/**
 * Rule 8: @key required - Multiple relations to same model need @key
 *
 * Exception for self-referential: a forward+reverse pair sharing the same @key is valid.
 * The rule is that two relations of the SAME type (both forward or both reverse) can't share @key.
 */
export function validateKeyRequired(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  for (const model of ast.models) {
    // Group relations by target model
    const relationsByTarget = new Map<string, RelationInfo[]>();

    for (const field of model.fields) {
      const info = getRelationInfo(field, model);
      if (!info) continue;

      const existing = relationsByTarget.get(info.targetModel) || [];
      existing.push(info);
      relationsByTarget.set(info.targetModel, existing);
    }

    // Check each target model
    for (const [targetModel, relations] of relationsByTarget) {
      if (relations.length <= 1) continue;

      // For self-referential relations, separate forward and reverse
      const isSelfRef = targetModel === model.name;

      if (isSelfRef) {
        // Self-referential: forward+reverse pairs can share @key
        // But two forwards or two reverses with same key is invalid
        const forwardRels = relations.filter((r) => !r.isReverse);
        const reverseRels = relations.filter((r) => r.isReverse);

        // Check forwards need unique keys among themselves if > 1
        if (forwardRels.length > 1) {
          for (const rel of forwardRels) {
            if (!rel.key) {
              errors.push({
                message: `Multiple forward relations to "${targetModel}" require @key for disambiguation. Add @key(name) to "${rel.field.name}"`,
                model: model.name,
                field: rel.field.name,
                line: rel.field.range.start.line,
              });
            }
          }

          // Check for duplicate keys among forwards
          const seen = new Set<string>();
          for (const rel of forwardRels) {
            if (!rel.key) continue;
            if (seen.has(rel.key)) {
              errors.push({
                message: `Duplicate @key(${rel.key}) on forward relations to "${targetModel}"`,
                model: model.name,
                field: rel.field.name,
                line: rel.field.range.start.line,
              });
            }
            seen.add(rel.key);
          }
        }

        // Check reverses need unique keys among themselves if > 1
        if (reverseRels.length > 1) {
          for (const rel of reverseRels) {
            if (!rel.key) {
              errors.push({
                message: `Multiple reverse relations to "${targetModel}" require @key for disambiguation. Add @key(name) to "${rel.field.name}"`,
                model: model.name,
                field: rel.field.name,
                line: rel.field.range.start.line,
              });
            }
          }

          // Check for duplicate keys among reverses
          const seen = new Set<string>();
          for (const rel of reverseRels) {
            if (!rel.key) continue;
            if (seen.has(rel.key)) {
              errors.push({
                message: `Duplicate @key(${rel.key}) on reverse relations to "${targetModel}"`,
                model: model.name,
                field: rel.field.name,
                line: rel.field.range.start.line,
              });
            }
            seen.add(rel.key);
          }
        }
      } else {
        // Non-self-referential: all relations need unique @key
        for (const rel of relations) {
          if (!rel.key) {
            errors.push({
              message: `Multiple relations to "${targetModel}" require @key for disambiguation. Add @key(name) to "${rel.field.name}"`,
              model: model.name,
              field: rel.field.name,
              line: rel.field.range.start.line,
            });
          }
        }

        // Check for duplicate keys
        const keys = relations.filter((r) => r.key).map((r) => r.key);
        const uniqueKeys = new Set(keys);
        if (keys.length !== uniqueKeys.size) {
          const seen = new Set<string>();
          for (const rel of relations) {
            if (!rel.key) continue;
            if (seen.has(rel.key)) {
              errors.push({
                message: `Duplicate @key(${rel.key}) for relations to "${targetModel}"`,
                model: model.name,
                field: rel.field.name,
                line: rel.field.range.start.line,
              });
            }
            seen.add(rel.key);
          }
        }
      }
    }
  }

  return errors;
}

/**
 * Rule 9 & 10: @key pairing and uniqueness
 * Forward and reverse relations with same @key must pair correctly
 */
export function validateKeyPairing(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const modelMap = new Map(ast.models.map((m) => [m.name, m]));

  for (const model of ast.models) {
    for (const field of model.fields) {
      if (field.type !== 'relation') continue;

      const keyDecorator = getDecorator(field, 'key');
      if (!keyDecorator) continue;

      const key = keyDecorator.value as string;
      const modelDecorator = getDecorator(field, 'model');
      const targetModelName = modelDecorator?.value as string;
      if (!targetModelName) continue;

      const fieldDecorator = getDecorator(field, 'field');
      const isForward = !!fieldDecorator;

      const targetModel = modelMap.get(targetModelName);
      if (!targetModel) continue;

      // Find counterpart with same @key in target model
      const counterpart = targetModel.fields.find((f) => {
        if (f.type !== 'relation') return false;

        const fModelDecorator = getDecorator(f, 'model');
        const fKeyDecorator = getDecorator(f, 'key');
        const fFieldDecorator = getDecorator(f, 'field');

        if (fModelDecorator?.value !== model.name) return false;
        if (fKeyDecorator?.value !== key) return false;

        // Counterpart should be opposite type (forward <-> reverse)
        const fIsForward = !!fFieldDecorator;

        return fIsForward !== isForward;
      });

      if (!counterpart) {
        const type = isForward ? 'forward' : 'reverse';
        const expectedType = isForward ? 'reverse' : 'forward';
        errors.push({
          message: `@key(${key}) on ${type} relation "${field.name}" requires matching ${expectedType} relation in "${targetModelName}"`,
          model: model.name,
          field: field.name,
          line: field.range.start.line,
        });
      }
    }
  }

  return errors;
}

/**
 * Validate Record fields don't have relation decorators
 */
export function validateRecordDecorators(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const relationDecorators = ['field', 'model', 'onDelete', 'key'];

  for (const model of ast.models) {
    for (const field of model.fields) {
      if (field.type !== 'record') continue;

      for (const decoratorType of relationDecorators) {
        if (hasDecorator(field, decoratorType as any)) {
          errors.push({
            message: `Record field "${field.name}" cannot have @${decoratorType} decorator. Only Relation fields can have relation decorators.`,
            model: model.name,
            field: field.name,
            line: field.range.start.line,
          });
        }
      }
    }
  }

  return errors;
}

/**
 * Validate all relation rules
 */
export function validateRelationRules(ast: SchemaAST): SchemaValidationError[] {
  return [
    ...validatePKStructure(ast),
    ...validateRecordDecorators(ast),
    ...validateOnDeletePlacement(ast),
    ...validateCardinalityMatch(ast),
    ...validateKeyRequired(ast),
    ...validateKeyPairing(ast),
    ...validateNonPKSide(ast),
    ...validateSingleSidedOptional(ast),
  ];
}
