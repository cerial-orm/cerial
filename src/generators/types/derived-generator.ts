/**
 * Derived type generator - generates Create, Update, Include, and other derived types
 *
 * Uses ts-toolbelt utilities for cleaner type definitions:
 * - O.Optional<T, K> - make keys K optional in T (clearer than Omit + Partial + Pick)
 * - O.Omit<T, K> - omit keys K from T
 * - A.Compute<T> - flatten complex nested types for better IDE tooltips
 */

import type {
  FieldMetadata,
  ModelMetadata,
  ModelRegistry,
  ObjectFieldMetadata,
  ObjectRegistry,
  TupleFieldMetadata,
} from '../../types';
import { schemaTypeToTsType } from '../../utils/type-utils';
import { getLiteralTypeName } from './enums';
import { getGeometryInputType } from './geometry-helpers';
import { literalNeedsInputType } from './literals';
import { objectHasDefaultOrTimestamp } from './objects/interface-generator';
import { generateTupleArrayForm, tupleHasUnsetableElements } from './tuples';

/** Whether to use ts-toolbelt utilities in generated types */
const USE_TS_TOOLBELT = true;

function getInputType(field: FieldMetadata): string {
  if (field.type === 'record') return 'RecordIdInput';
  if (field.type === 'uuid') return 'CerialUuidInput';
  if (field.type === 'duration') return 'CerialDurationInput';
  if (field.type === 'decimal') return 'CerialDecimalInput';
  if (field.type === 'bytes') return 'CerialBytesInput';
  if (field.type === 'any') return 'CerialAny';
  if (field.type === 'geometry') return getGeometryInputType(field);
  if (field.type === 'literal' && field.literalInfo) {
    const lit = field.literalInfo;
    if (lit.isEnum) return getLiteralTypeName(lit);
    if (literalNeedsInputType({ name: lit.literalName, variants: lit.variants })) return `${lit.literalName}Input`;

    return lit.literalName;
  }

  return schemaTypeToTsType(field.type);
}

/** Get fields that should be omitted from create (auto-generated or computed) */
function getOmitForCreate(model: ModelMetadata): string[] {
  return model.fields
    .filter((f) => {
      // Relation fields should be omitted (virtual fields) - they get their own nested types
      if (f.type === 'relation') return true;
      // @now fields are COMPUTED (not stored) — excluded from create input
      if (f.timestampDecorator === 'now') return true;

      return false;
    })
    .map((f) => f.name);
}

/** Get Record fields that are managed by a Relation @field() - these should be omitted in nested create */
function getRecordFieldsManagedByRelations(model: ModelMetadata): string[] {
  const managedRecordFields = new Set<string>();

  for (const field of model.fields) {
    if (field.type === 'relation' && field.relationInfo?.fieldRef) {
      managedRecordFields.add(field.relationInfo.fieldRef);
    }
  }

  return Array.from(managedRecordFields);
}

/** Get relation fields that need nested operation types */
function getRelationFieldsForNestedOps(model: ModelMetadata): Array<{
  name: string;
  targetModel: string;
  isArray: boolean;
  isRequired: boolean;
  isReverse: boolean;
  fieldRef?: string;
}> {
  return model.fields
    .filter((f) => f.type === 'relation' && f.relationInfo)
    .map((f) => {
      const storageField = f.relationInfo?.fieldRef
        ? model.fields.find((sf) => sf.name === f.relationInfo!.fieldRef)
        : null;

      return {
        name: f.name,
        targetModel: f.relationInfo!.targetModel,
        isArray: f.isArray || storageField?.isArray || false,
        isRequired: f.isRequired && !f.relationInfo!.isReverse,
        isReverse: f.relationInfo!.isReverse,
        fieldRef: f.relationInfo?.fieldRef,
      };
    });
}

/** Get fields that should be optional in create (have defaults or are auto-generated) */
function getOptionalForCreate(model: ModelMetadata): string[] {
  const optional = new Set<string>();

  for (const field of model.fields) {
    // Skip relation fields (they're omitted entirely)
    if (field.type === 'relation') continue;

    // Fields with default values are optional
    if (field.defaultValue !== undefined) {
      optional.add(field.name);
    }
    // @id fields are optional (db can auto-generate)
    if (field.isId) {
      optional.add(field.name);
    }
    // @createdAt and @updatedAt fields are optional (db can auto-generate)
    if (field.timestampDecorator === 'createdAt' || field.timestampDecorator === 'updatedAt') {
      optional.add(field.name);
    }
    // @uuid/@uuid4/@uuid7 fields are optional (db can auto-generate)
    if (field.uuidDecorator) {
      optional.add(field.name);
    }
    // @defaultAlways fields are optional (db fills via DEFAULT ALWAYS)
    if (field.defaultAlwaysValue !== undefined) {
      optional.add(field.name);
    }
    // Optional fields are optional
    if (!field.isRequired) {
      optional.add(field.name);
    }
    // Array fields are optional (defaults to empty array)
    if (field.isArray) {
      optional.add(field.name);
    }
  }

  return Array.from(optional);
}

/**
 * Get object fields that need CreateInput substitution
 * These are object-typed fields where the nested object has @default/@now fields
 */
function getObjectFieldsWithDefaults(model: ModelMetadata, objectRegistry?: ObjectRegistry): FieldMetadata[] {
  if (!objectRegistry) return [];

  return model.fields.filter((f) => {
    if (f.type !== 'object' || !f.objectInfo) return false;
    const nested = objectRegistry[f.objectInfo.objectName];

    return nested && objectHasDefaultOrTimestamp(nested, objectRegistry);
  });
}

/** Get object fields that need special Create type handling (have defaults or @flexible) */
function getObjectFieldsNeedingCreateOverride(model: ModelMetadata, objectRegistry?: ObjectRegistry): FieldMetadata[] {
  if (!objectRegistry) return [];

  return model.fields.filter((f) => {
    if (f.type !== 'object' || !f.objectInfo) return false;
    if (f.isFlexible) return true;
    const nested = objectRegistry[f.objectInfo.objectName];

    return nested && objectHasDefaultOrTimestamp(nested, objectRegistry);
  });
}

/** Generate Create type - uses ModelInput for input types (accepts RecordIdInput) */
export function generateCreateType(model: ModelMetadata, objectRegistry?: ObjectRegistry): string {
  const omit = getOmitForCreate(model);
  const optional = getOptionalForCreate(model);
  const inputType = `${model.name}Input`;

  // Object fields that need special handling in Create (have defaults, @now, or @flexible)
  const objectFieldsNeedingOverride = getObjectFieldsNeedingCreateOverride(model, objectRegistry);

  // If there are object fields that need override, they must be omitted from the base
  // transformation and re-added with the correct type
  if (objectFieldsNeedingOverride.length) {
    const allOmit = [...new Set([...omit, ...objectFieldsNeedingOverride.map((f) => f.name)])];
    const optionalFields = optional.filter((f) => !allOmit.includes(f));

    // Build the base type with omit + optional transformations
    let baseType: string;
    const omitKeys = allOmit.map((f) => `'${f}'`).join(' | ');
    const optionalKeys = optionalFields.length ? optionalFields.map((f) => `'${f}'`).join(' | ') : '';

    if (USE_TS_TOOLBELT) {
      if (allOmit.length > 0 && optionalKeys) {
        baseType = `O.Optional<O.Omit<${inputType}, ${omitKeys}>, ${optionalKeys}>`;
      } else if (allOmit.length > 0) {
        baseType = `O.Omit<${inputType}, ${omitKeys}>`;
      } else if (optionalKeys) {
        baseType = `O.Optional<${inputType}, ${optionalKeys}>`;
      } else {
        baseType = inputType;
      }
    } else {
      if (allOmit.length > 0) {
        baseType = `Omit<${inputType}, ${omitKeys}>`;
        if (optionalKeys) {
          baseType += ` & Partial<Pick<${inputType}, ${optionalKeys}>>`;
        }
      } else if (optionalKeys) {
        baseType = `Partial<Pick<${inputType}, ${optionalKeys}>>`;
      } else {
        baseType = inputType;
      }
    }

    // Re-add object fields with CreateInput types and/or @flexible intersection
    const objectFieldDefs: string[] = [];
    for (const f of objectFieldsNeedingOverride) {
      const objName = f.objectInfo!.objectName;
      const nested = objectRegistry ? objectRegistry[objName] : undefined;
      const hasDefaults = nested && objectHasDefaultOrTimestamp(nested, objectRegistry);
      const baseName = hasDefaults ? `${objName}CreateInput` : `${objName}Input`;
      const fullType = f.isFlexible ? `(${baseName} & Record<string, any>)` : baseName;

      if (f.isArray) {
        // Array object fields are always optional in create (default to [])
        objectFieldDefs.push(`  ${f.name}?: ${fullType}[];`);
      } else if (!f.isRequired) {
        // Optional object field (no null — object fields don't support null)
        objectFieldDefs.push(`  ${f.name}?: ${f.isFlexible ? fullType : baseName};`);
      } else {
        objectFieldDefs.push(`  ${f.name}: ${f.isFlexible ? fullType : baseName};`);
      }
    }

    return `export type ${model.name}Create = ${baseType} & {
${objectFieldDefs.join('\n')}
};`;
  }

  // Standard path: no objects with defaults
  if (!omit.length && !optional.length) return `export type ${model.name}Create = ${inputType};`;

  // Get optional fields that aren't already omitted
  const optionalFields = optional.filter((f) => !omit.includes(f));

  if (omit.length === 0 && optionalFields.length === 0) {
    return `export type ${model.name}Create = ${inputType};`;
  }

  if (USE_TS_TOOLBELT) {
    // Use ts-toolbelt: O.Optional<O.Omit<T, omit>, optional>
    // This is cleaner than Omit + Partial + Pick
    const omitKeys = omit.map((f) => `'${f}'`).join(' | ');
    const optionalKeys = optionalFields.map((f) => `'${f}'`).join(' | ');

    if (omit.length > 0 && optionalFields.length > 0) {
      return `export type ${model.name}Create = O.Optional<O.Omit<${inputType}, ${omitKeys}>, ${optionalKeys}>;`;
    } else if (omit.length > 0) {
      return `export type ${model.name}Create = O.Omit<${inputType}, ${omitKeys}>;`;
    } else {
      return `export type ${model.name}Create = O.Optional<${inputType}, ${optionalKeys}>;`;
    }
  }

  // Fallback: standard TypeScript utilities
  const allOmit = [...omit, ...optionalFields];
  let type = `Omit<${inputType}, ${allOmit.map((f) => `'${f}'`).join(' | ')}>`;

  if (optionalFields.length > 0) {
    type += ` & Partial<Pick<${inputType}, ${optionalFields.map((f) => `'${f}'`).join(' | ')}>>`;
  }

  return `export type ${model.name}Create = ${type};`;
}

/** Map schema type to TypeScript array element type for input types */
function getArrayElementType(schemaType: string, field?: FieldMetadata): string {
  if (schemaType === 'literal' && field?.literalInfo) {
    const lit = field.literalInfo;
    if (lit.isEnum) return getLiteralTypeName(lit);
    if (literalNeedsInputType({ name: lit.literalName, variants: lit.variants })) return `${lit.literalName}Input`;

    return lit.literalName;
  }

  const typeMap: Record<string, string> = {
    string: 'string',
    email: 'string',
    int: 'number',
    float: 'number',
    bool: 'boolean',
    date: 'Date',
    record: 'RecordIdInput',
    uuid: 'CerialUuidInput',
    duration: 'CerialDurationInput',
    decimal: 'CerialDecimalInput',
    bytes: 'CerialBytesInput',
    geometry: 'CerialGeometryInput',
    any: 'CerialAny',
  };

  return typeMap[schemaType] ?? 'unknown';
}

/**
 * Generate nested create input type for a single relation field
 * - Array relations: { create?: T[], connect?: RecordIdInput[] }
 * - Single relations: { create: T } | { connect: RecordIdInput }
 */
function generateNestedCreateFieldType(
  fieldName: string,
  targetModel: string,
  isArray: boolean,
  isRequired: boolean,
  isReverse: boolean,
): string {
  if (isArray) {
    // Array relation - both create and connect are optional arrays
    return `  ${fieldName}?: {
    create?: ${targetModel}NestedCreate | ${targetModel}NestedCreate[];
    connect?: RecordIdInput | RecordIdInput[];
  };`;
  }

  // Single relation - mutually exclusive create OR connect
  if (isRequired && !isReverse) {
    // Required relation - must provide create or connect
    return `  ${fieldName}: { create: ${targetModel}NestedCreate } | { connect: RecordIdInput };`;
  }

  // Optional relation - can omit or provide create/connect
  return `  ${fieldName}?: { create: ${targetModel}NestedCreate } | { connect: RecordIdInput };`;
}

/**
 * Generate nested update input type for a single relation field
 * - Array relations: { create?, connect?, disconnect? }
 * - Single optional relations: { create?, connect?, disconnect? }
 * - Single required relations: { create?, connect? } (no disconnect)
 */
function generateNestedUpdateFieldType(
  fieldName: string,
  targetModel: string,
  isArray: boolean,
  isRequired: boolean,
): string {
  if (isArray) {
    // Array relation - can add/remove multiple, or replace all with set
    return `  ${fieldName}?: {
    create?: ${targetModel}NestedCreate | ${targetModel}NestedCreate[];
    connect?: RecordIdInput | RecordIdInput[];
    disconnect?: RecordIdInput | RecordIdInput[];
    set?: RecordIdInput[];
  };`;
  }

  if (isRequired) {
    // Required single relation - cannot disconnect
    return `  ${fieldName}?: { create: ${targetModel}NestedCreate } | { connect: RecordIdInput };`;
  }

  // Optional single relation - can disconnect
  return `  ${fieldName}?: { create: ${targetModel}NestedCreate } | { connect: RecordIdInput } | { disconnect: true };`;
}

/** Generate NestedCreate type (for use in nested operations) - excludes relation nesting to prevent infinite types */
export function generateNestedCreateType(model: ModelMetadata): string {
  const omit = getOmitForCreate(model);
  const optional = getOptionalForCreate(model);
  const managedRecords = getRecordFieldsManagedByRelations(model);
  const inputType = `${model.name}Input`;

  // For nested create, also omit Record fields that are managed by Relation @field()
  const allOmit = [...new Set([...omit, ...managedRecords])];

  // Get optional fields that aren't already omitted
  const optionalFields = optional.filter((f) => !allOmit.includes(f));

  if (allOmit.length === 0 && optionalFields.length === 0) {
    return `export type ${model.name}NestedCreate = ${inputType};`;
  }

  if (USE_TS_TOOLBELT) {
    const omitKeys = allOmit.map((f) => `'${f}'`).join(' | ');
    const optionalKeys = optionalFields.map((f) => `'${f}'`).join(' | ');

    if (allOmit.length > 0 && optionalFields.length > 0) {
      return `export type ${model.name}NestedCreate = O.Optional<O.Omit<${inputType}, ${omitKeys}>, ${optionalKeys}>;`;
    } else if (allOmit.length > 0) {
      return `export type ${model.name}NestedCreate = O.Omit<${inputType}, ${omitKeys}>;`;
    } else {
      return `export type ${model.name}NestedCreate = O.Optional<${inputType}, ${optionalKeys}>;`;
    }
  }

  // Fallback without ts-toolbelt
  const allOmitForPartial = [...allOmit, ...optionalFields];
  let type = `Omit<${inputType}, ${allOmitForPartial.map((f) => `'${f}'`).join(' | ')}>`;

  if (optionalFields.length > 0) {
    type += ` & Partial<Pick<${inputType}, ${optionalFields.map((f) => `'${f}'`).join(' | ')}>>`;
  }

  return `export type ${model.name}NestedCreate = ${type};`;
}

/** Generate CreateInput type with nested operation support for relations */
export function generateCreateInputType(model: ModelMetadata): string {
  const relationFields = getRelationFieldsForNestedOps(model);

  if (relationFields.length === 0) {
    // No relations - CreateInput is just an alias for Create
    return `export type ${model.name}CreateInput = ${model.name}Create;`;
  }

  // Get Record fields that are managed by relations - these need to be omitted from nested variant
  const managedRecords = getRecordFieldsManagedByRelations(model);

  // Generate relation field types
  const relationFieldTypes = relationFields
    .map((rf) => generateNestedCreateFieldType(rf.name, rf.targetModel, rf.isArray, rf.isRequired, rf.isReverse))
    .join('\n');

  // Check if any relation is required
  const hasRequiredRelation = relationFields.some((rf) => rf.isRequired && !rf.isReverse);

  // Generate two variants as a union:
  // 1. Raw variant: allows direct Record field values (e.g., userId)
  // 2. Nested variant: allows nested create/connect syntax (e.g., user: { connect: id })
  if (managedRecords.length > 0) {
    const omitKeys = managedRecords.map((f) => `'${f}'`).join(' | ');

    // For required relations, the nested variant requires the relation field
    // For optional relations, the nested variant has optional relation field
    if (USE_TS_TOOLBELT) {
      // Union: raw variant OR nested variant
      // Raw: just the Create type as-is (allows userId directly)
      // Nested: omit managed Record fields and add relation operations
      return `export type ${model.name}CreateInput =
  | ${model.name}Create
  | (O.Omit<${model.name}Create, ${omitKeys}> & {
${relationFieldTypes}
});`;
    }

    return `export type ${model.name}CreateInput =
  | ${model.name}Create
  | (Omit<${model.name}Create, ${omitKeys}> & {
${relationFieldTypes}
});`;
  }

  // No managed record fields, just extend Create with optional relation operations
  return `export type ${model.name}CreateInput = ${model.name}Create & {
${relationFieldTypes}
};`;
}

/** Generate UpdateInput type with nested operation support for relations */
export function generateUpdateInputType(model: ModelMetadata): string {
  // Exclude relations whose PK Record field is @readonly — those can't be updated
  const allRelationFields = getRelationFieldsForNestedOps(model);
  const relationFields = allRelationFields.filter((rf) => {
    if (!rf.fieldRef) return true; // Reverse relations are not affected
    const storageField = model.fields.find((f) => f.name === rf.fieldRef);

    return !storageField?.isReadonly;
  });

  if (relationFields.length === 0) {
    // No relations - UpdateInput is just an alias for Update
    return `export type ${model.name}UpdateInput = ${model.name}Update;`;
  }

  // Get Record fields that are managed by relations - these need to be omitted from nested variant
  // Exclude @readonly Record fields — they can't be updated at all
  const managedRecords = getRecordFieldsManagedByRelations(model).filter((name) => {
    const field = model.fields.find((f) => f.name === name);

    return !field?.isReadonly;
  });

  // Generate relation field types for update
  const relationFieldTypes = relationFields
    .map((rf) => generateNestedUpdateFieldType(rf.name, rf.targetModel, rf.isArray, rf.isRequired))
    .join('\n');

  // Generate two variants as a union:
  // 1. Raw variant: allows direct Record field values (e.g., userId)
  // 2. Nested variant: allows nested create/connect/disconnect syntax
  if (managedRecords.length > 0) {
    const omitKeys = managedRecords.map((f) => `'${f}'`).join(' | ');
    if (USE_TS_TOOLBELT) {
      // Union: raw variant OR nested variant
      return `export type ${model.name}UpdateInput =
  | ${model.name}Update
  | (O.Omit<${model.name}Update, ${omitKeys}> & {
${relationFieldTypes}
});`;
    }

    return `export type ${model.name}UpdateInput =
  | ${model.name}Update
  | (Omit<${model.name}Update, ${omitKeys}> & {
${relationFieldTypes}
});`;
  }

  // No managed record fields, just extend Update with optional relation operations
  return `export type ${model.name}UpdateInput = ${model.name}Update & {
${relationFieldTypes}
};`;
}

/** Generate Update type (all fields partial except id) with array operations for all array types */
export function generateUpdateType(model: ModelMetadata): string {
  const idField = model.fields.find((f) => f.isId);
  const arrayFields = model.fields.filter(
    (f) => f.isArray && f.type !== 'relation' && f.type !== 'object' && f.type !== 'tuple',
  );
  const relationFields = model.fields.filter((f) => f.type === 'relation');
  const objectFields = model.fields.filter((f) => f.type === 'object' && f.objectInfo);
  const tupleFields = model.fields.filter((f) => f.type === 'tuple' && f.tupleInfo);
  const inputType = `${model.name}Input`;

  // @now fields are COMPUTED (not stored) — excluded from update input
  const computedFields = model.fields.filter((f) => f.timestampDecorator === 'now');

  // @readonly fields are write-once — excluded from update input
  const readonlyFields = model.fields.filter(
    (f) => f.isReadonly && f.type !== 'relation' && !f.isId && f.timestampDecorator !== 'now',
  );

  // Fields to exclude from update (id, relation, computed, and readonly fields)
  const excludeFields = [
    ...(idField ? [idField.name] : []),
    ...relationFields.map((f) => f.name),
    ...computedFields.map((f) => f.name),
    ...readonlyFields.map((f) => f.name),
  ];

  // Primitive fields that need nullable/NONE handling in update
  // These are non-array, non-relation, non-object, non-tuple fields that have @nullable or are optional
  const nullableOrOptionalPrimitives = model.fields.filter((f) => {
    if (f.isId) return false;
    if (f.isReadonly) return false;
    if (f.type === 'relation') return false;
    if (f.type === 'object') return false;
    if (f.type === 'tuple') return false;
    if (f.isArray) return false;
    if (f.timestampDecorator === 'now') return false;

    // Only need special handling if nullable or optional (needs | null or | CerialNone)
    return f.isNullable || !f.isRequired;
  });

  // Fields that need special handling (arrays, objects, tuples, and nullable/optional primitives) — omit from base Partial
  // Exclude @readonly fields from special handling — they're already excluded from update entirely
  const specialFields = [...arrayFields, ...objectFields, ...tupleFields, ...nullableOrOptionalPrimitives].filter(
    (f) => !f.isReadonly,
  );
  const hasSpecialFields = specialFields.length > 0;

  if (!hasSpecialFields) {
    const excludeKeys = excludeFields.map((f) => `'${f}'`).join(' | ');
    if (excludeFields.length > 0) {
      if (USE_TS_TOOLBELT) {
        return `export type ${model.name}Update = Partial<O.Omit<${inputType}, ${excludeKeys}>>;`;
      }

      return `export type ${model.name}Update = Partial<Omit<${inputType}, ${excludeKeys}>>;`;
    }

    return `export type ${model.name}Update = Partial<${inputType}>;`;
  }

  // Generate interface with special operations
  const baseOmit = [...excludeFields, ...specialFields.map((f) => f.name)];
  const baseOmitKeys = baseOmit.map((f) => `'${f}'`).join(' | ');
  const baseType =
    baseOmit.length > 0
      ? USE_TS_TOOLBELT
        ? `Partial<O.Omit<${inputType}, ${baseOmitKeys}>>`
        : `Partial<Omit<${inputType}, ${baseOmitKeys}>>`
      : `Partial<${inputType}>`;

  const specialFieldTypes: string[] = [];

  // Array primitive fields (skip @readonly — already excluded from update)
  for (const f of arrayFields.filter((af) => !af.isReadonly)) {
    const elementType = getArrayElementType(f.type, f);
    specialFieldTypes.push(`  ${f.name}?: ${elementType}[] | {
    push?: ${elementType} | ${elementType}[];
    unset?: ${elementType} | ${elementType}[];
  };`);
  }

  // Object fields (skip @readonly — already excluded from update)
  for (const f of objectFields.filter((of) => !of.isReadonly)) {
    const objName = f.objectInfo!.objectName;
    const inputName = `${objName}Input`;
    const whereName = `${objName}Where`;

    // Check if the object has @readonly sub-fields that need to be omitted from Partial
    const readonlySubFields = f.objectInfo!.fields.filter((sf) => sf.isReadonly);
    const readonlyOmitKeys = readonlySubFields.map((sf) => `'${sf.name}'`).join(' | ');
    const partialInput =
      readonlySubFields.length > 0
        ? USE_TS_TOOLBELT
          ? `Partial<O.Omit<${inputName}, ${readonlyOmitKeys}>>`
          : `Partial<Omit<${inputName}, ${readonlyOmitKeys}>>`
        : `Partial<${inputName}>`;

    if (f.isFlexible) {
      // @flexible: wrap with & Record<string, any>
      const flexInput = `(${inputName} & Record<string, any>)`;
      const flexWhere = `${whereName} & { [key: string]: any }`;
      const partialFlexInput =
        readonlySubFields.length > 0
          ? USE_TS_TOOLBELT
            ? `Partial<O.Omit<${inputName}, ${readonlyOmitKeys}> & Record<string, any>>`
            : `Partial<Omit<${inputName}, ${readonlyOmitKeys}> & Record<string, any>>`
          : `Partial<${inputName} & Record<string, any>>`;

      if (f.isArray) {
        specialFieldTypes.push(`  ${f.name}?: ${flexInput}[] | {
    push?: ${flexInput} | ${flexInput}[];
    set?: ${flexInput}[];
    updateWhere?: {
      where: ${flexWhere};
      data: ${partialFlexInput};
    };
    unset?: { where: ${flexWhere} };
  };`);
      } else if (!f.isRequired) {
        // Optional flexible single object: partial merge, full replace, or CerialNone (to clear)
        specialFieldTypes.push(
          `  ${f.name}?: ${partialFlexInput} | { set: ${inputName} & Record<string, any> } | CerialNone;`,
        );
      } else {
        specialFieldTypes.push(`  ${f.name}?: ${partialFlexInput} | { set: ${inputName} & Record<string, any> };`);
      }
    } else if (f.isArray) {
      // Array of objects: full replace, push, set, updateWhere, unset
      specialFieldTypes.push(`  ${f.name}?: ${inputName}[] | {
    push?: ${inputName} | ${inputName}[];
    set?: ${inputName}[];
    updateWhere?: {
      where: ${whereName};
      data: ${partialInput};
    };
    unset?: { where: ${whereName} };
  };`);
    } else if (f.isRequired) {
      // Required single object: partial merge or full replace
      specialFieldTypes.push(`  ${f.name}?: ${partialInput} | { set: ${inputName} };`);
    } else {
      // Optional single object: partial merge, full replace, or CerialNone (to clear/remove)
      // Objects cannot be @nullable (validated), so only NONE is supported for clearing
      specialFieldTypes.push(`  ${f.name}?: ${partialInput} | { set: ${inputName} } | CerialNone;`);
    }
  }

  // Tuple fields (skip @readonly — already excluded from update)
  // Single tuples use array/object disambiguation: array = full replace, object = per-element update
  // Array-form-only type prevents ambiguity (no object form for full replace)
  for (const f of tupleFields.filter((tf) => !tf.isReadonly)) {
    const tupleName = f.tupleInfo!.tupleName;
    const tupleInputName = `${tupleName}Input`;
    const tupleUpdateName = `${tupleName}Update`;

    if (f.isArray) {
      // Array of tuples: full replace, push, set — NO per-element update for arrays
      specialFieldTypes.push(`  ${f.name}?: ${tupleInputName}[] | {
    push?: ${tupleInputName} | ${tupleInputName}[];
    set?: ${tupleInputName}[];
  };`);
    } else {
      // Single tuple: array = full replace, object = per-element update
      const arrayForm = generateTupleArrayForm(f.tupleInfo!);
      let type = `${arrayForm} | ${tupleUpdateName}`;

      if (f.isNullable && !f.isRequired) {
        type += ' | null | CerialNone';
      } else if (f.isNullable) {
        type += ' | null';
      } else if (!f.isRequired) {
        type += ' | CerialNone';
      }

      specialFieldTypes.push(`  ${f.name}?: ${type};`);
    }
  }

  // Nullable/optional primitive fields — need | null or | CerialNone in update
  for (const f of nullableOrOptionalPrimitives.filter((pf) => !pf.isReadonly)) {
    const tsType = getInputType(f);
    if (f.isNullable && !f.isRequired) {
      // Optional + nullable: can set value, null, or NONE
      specialFieldTypes.push(`  ${f.name}?: ${tsType} | null | CerialNone;`);
    } else if (f.isNullable) {
      // Required + nullable: can set value or null
      specialFieldTypes.push(`  ${f.name}?: ${tsType} | null;`);
    } else {
      // Optional + non-nullable: can set value or NONE
      specialFieldTypes.push(`  ${f.name}?: ${tsType} | CerialNone;`);
    }
  }

  return `export type ${model.name}Update = ${baseType} & {
${specialFieldTypes.join('\n')}
};`;
}

/**
 * Check if a tuple field has object elements at any nesting depth.
 * Uses TupleFieldMetadata (runtime metadata) for recursive checking.
 */
function tupleFieldHasObjectsDeep(tupleInfo: TupleFieldMetadata, visited: Set<string> = new Set()): boolean {
  if (visited.has(tupleInfo.tupleName)) return false;
  visited.add(tupleInfo.tupleName);

  for (const element of tupleInfo.elements) {
    if (element.type === 'object') return true;
    if (element.type === 'tuple' && element.tupleInfo) {
      if (tupleFieldHasObjectsDeep(element.tupleInfo, visited)) return true;
    }
  }

  return false;
}

/** Get the select type for a field (boolean for primitives, boolean | ObjectSelect for objects, boolean | TupleSelect for tuples with objects) */
function getFieldSelectType(field: FieldMetadata): string {
  if (field.type === 'object' && field.objectInfo) return `boolean | ${field.objectInfo.objectName}Select`;
  if (field.type === 'tuple' && field.tupleInfo && tupleFieldHasObjectsDeep(field.tupleInfo)) {
    return `boolean | ${field.tupleInfo.tupleName}Select`;
  }

  return 'boolean';
}

/** Generate Select type (boolean map of fields, requires at least one field) */
export function generateSelectType(model: ModelMetadata): string {
  // Filter out relation fields (virtual fields not stored)
  const selectableFields = model.fields.filter((f) => f.type !== 'relation');

  if (selectableFields.length === 0) {
    return `export interface ${model.name}Select {}`;
  }

  if (selectableFields.length === 1) {
    const f = selectableFields[0]!;
    const selectType = getFieldSelectType(f);

    return `export type ${model.name}Select = { ${f.name}: ${selectType}; };`;
  }

  // Generate union where each variant requires at least one field
  // For each field, make it required and all others optional
  const variants = selectableFields.map((field) => {
    const selectType = getFieldSelectType(field);
    const otherFields = selectableFields.filter((f) => f.name !== field.name);

    // Build the Partial record for other fields, each with their own select type
    const hasNonBooleanOthers = otherFields.some((f) => getFieldSelectType(f) !== 'boolean');

    if (hasNonBooleanOthers) {
      // When some other fields have non-boolean select types (objects, tuples with objects), we need per-field optional types
      const otherFieldDefs = otherFields.map((f) => `${f.name}?: ${getFieldSelectType(f)}`).join('; ');

      return `  | { ${field.name}: ${selectType} } & { ${otherFieldDefs} }`;
    }

    const otherKeys = otherFields.map((f) => `'${f.name}'`).join(' | ');

    return `  | { ${field.name}: ${selectType} } & Partial<Record<${otherKeys}, boolean>>`;
  });

  return `export type ${model.name}Select =
${variants.join('\n')};`;
}

/** Generate OrderBy type */
export function generateOrderByType(model: ModelMetadata): string {
  const fields: string[] = [];

  for (const field of model.fields) {
    if (field.type === 'relation') {
      // Relation fields are excluded from OrderBy — SurrealDB 3.x does not support
      // ORDER BY through record link dot notation (e.g., authorId.name).
      // Ordering by related fields silently returns insertion order.
      continue;
    } else if (field.type === 'object' && field.objectInfo) {
      // Object fields support nested ordering (e.g., orderBy: { address: { city: 'asc' } })
      fields.push(`  ${field.name}?: ${field.objectInfo.objectName}OrderBy;`);
    } else if (field.type === 'tuple') {
      // Tuple fields do not support ordering — skip
      continue;
    } else if (field.type === 'geometry') {
      // Geometry fields do not support ordering — skip
      continue;
    } else if (field.type === 'any') {
      continue;
    } else if (field.type === 'literal') {
      if (field.literalInfo?.isEnum) {
        // Enum fields are string-only — ordering works fine
        fields.push(`  ${field.name}?: 'asc' | 'desc';`);
      }
      // Non-enum literals may contain mixed types — skip
      continue;
    } else {
      fields.push(`  ${field.name}?: 'asc' | 'desc';`);
    }
  }

  return `export interface ${model.name}OrderBy {
${fields.join('\n')}
}`;
}

/** Check if a model has any relation fields */
function modelHasRelations(modelMetadata: ModelMetadata): boolean {
  return modelMetadata.fields.some((f) => f.type === 'relation' && f.relationInfo);
}

/** Generate Include type for relation fields */
export function generateIncludeType(model: ModelMetadata, registry?: ModelRegistry): string {
  const relationFields = model.fields.filter((f) => f.type === 'relation' && f.relationInfo);

  if (relationFields.length === 0) {
    return ''; // No include type needed
  }

  const fieldTypes = relationFields
    .map((field) => {
      if (!field.relationInfo) return '';
      const targetModel = field.relationInfo.targetModel;

      // Check if target model has relations (and thus an Include type)
      const targetModelMeta = registry?.[targetModel];
      const targetHasInclude = targetModelMeta && modelHasRelations(targetModelMeta);
      const includeOption = targetHasInclude ? `\n    include?: ${targetModel}Include;` : '';

      // Find if the storage field is an array (one-to-many)
      const storageField = field.relationInfo.fieldRef
        ? model.fields.find((f) => f.name === field.relationInfo!.fieldRef)
        : null;

      const isArrayRelation = storageField?.isArray || false;
      const isReverseRelation = field.relationInfo.isReverse;

      // For array relations or reverse relations (both return arrays), include pagination
      if (isArrayRelation || isReverseRelation) {
        return `  ${field.name}?: boolean | {
    select?: ${targetModel}Select;
    where?: ${targetModel}Where;
    orderBy?: ${targetModel}OrderBy;
    limit?: number;
    offset?: number;${includeOption}
  };`;
      }

      // For single relations
      return `  ${field.name}?: boolean | {
    select?: ${targetModel}Select;
    where?: ${targetModel}Where;${includeOption}
  };`;
    })
    .filter((line) => line !== '')
    .join('\n');

  return `export interface ${model.name}Include {
${fieldTypes}
}`;
}

/** Generate $Relations type that maps relation names to their types */
export function generateRelationsType(model: ModelMetadata, registry?: ModelRegistry): string {
  const relationFields = model.fields.filter((f) => f.type === 'relation' && f.relationInfo);

  if (relationFields.length === 0) {
    return `export type ${model.name}$Relations = {};`;
  }

  const fieldTypes = relationFields
    .map((field) => {
      if (!field.relationInfo) return '';
      const targetModel = field.relationInfo.targetModel;

      // Check if target model has relations (and thus an Include type)
      const targetModelMeta = registry?.[targetModel];
      const targetHasInclude = targetModelMeta && modelHasRelations(targetModelMeta);

      // Determine if this is an array relation
      // For forward relations: check the storage field (Record[])
      // For reverse relations: check field.isArray (Relation[])
      const storageField = field.relationInfo.fieldRef
        ? model.fields.find((f) => f.name === field.relationInfo!.fieldRef)
        : null;

      const isArrayRelation = field.isArray || storageField?.isArray || false;

      // Determine the relation type (single or array)
      const relationType = isArrayRelation ? `${targetModel}[]` : targetModel;
      const includeType = targetHasInclude ? `${targetModel}Include` : 'never';

      return `  ${field.name}: { type: ${relationType}; include: ${includeType} };`;
    })
    .filter((line) => line !== '')
    .join('\n');

  return `export type ${model.name}$Relations = {
${fieldTypes}
};`;
}

/** Helper to generate the select payload type for a relation */
function generateRelationSelectPayload(targetModel: string): string {
  return `{ [P in keyof S as S[P] extends false | undefined ? never : P]: P extends keyof ${targetModel} ? ResolveFieldSelect<${targetModel}[P], S[P]> : never }`;
}

/** Generate IncludePayload helper type for a model */
export function generateIncludePayloadType(model: ModelMetadata, registry?: ModelRegistry): string {
  const relationFields = model.fields.filter((f) => f.type === 'relation' && f.relationInfo);

  if (relationFields.length === 0) {
    return '';
  }

  // Generate a clean conditional type for each relation
  const relationPayloads = relationFields
    .map((field) => {
      if (!field.relationInfo) return '';
      const targetModel = field.relationInfo.targetModel;
      const targetModelMeta = registry?.[targetModel];
      const targetHasInclude = targetModelMeta && modelHasRelations(targetModelMeta);

      const storageField = field.relationInfo.fieldRef
        ? model.fields.find((f) => f.name === field.relationInfo!.fieldRef)
        : null;
      // Check field.isArray for reverse relations (Relation[]), storageField for forward relations
      const isArray = field.isArray || storageField?.isArray || false;
      const wrapArray = (t: string) => (isArray ? `${t}[]` : t);
      const selectPayload = generateRelationSelectPayload(targetModel);

      let typeBody: string;
      if (targetHasInclude) {
        typeBody = `I['${field.name}'] extends true
      ? ${wrapArray(targetModel)}
      : I['${field.name}'] extends { select: infer S extends ${targetModel}Select; include: infer NI extends ${targetModel}Include }
        ? ${wrapArray(`(${selectPayload} & Get${targetModel}IncludePayload<NI>)`)}
        : I['${field.name}'] extends { select: infer S extends ${targetModel}Select }
          ? ${wrapArray(selectPayload)}
          : I['${field.name}'] extends { include: infer NI extends ${targetModel}Include }
            ? ${wrapArray(`(${targetModel} & Get${targetModel}IncludePayload<NI>)`)}
            : ${wrapArray(targetModel)}`;
      } else {
        typeBody = `I['${field.name}'] extends true
      ? ${wrapArray(targetModel)}
      : I['${field.name}'] extends { select: infer S extends ${targetModel}Select }
        ? ${wrapArray(selectPayload)}
        : ${wrapArray(targetModel)}`;
      }

      return `  ${field.name}: ${typeBody};`;
    })
    .filter((line) => line !== '')
    .join('\n');

  return `export type Get${model.name}IncludePayload<I extends ${model.name}Include | undefined> = I extends ${model.name}Include
  ? Pick<{
${relationPayloads}
    }, Extract<keyof I, keyof ${model.name}$Relations> & { [K in keyof I]: I[K] extends false | undefined ? never : K }[keyof I]>
  : {};`;
}

/** Generate GetPayload type for a model - computes result type based on select/include */
export function generateGetPayloadType(model: ModelMetadata): string {
  const hasRelationFields = model.fields.some((f) => f.type === 'relation' && f.relationInfo);

  // A.Compute flattens complex conditional types for better IDE tooltips
  // 'flat' mode preserves tuple identity — 'deep' mode destroys mapped tuples via recursive flattening
  const wrapCompute = (type: string) => (USE_TS_TOOLBELT ? `A.Compute<${type}, 'flat'>` : type);

  if (!hasRelationFields) {
    // No relations - simple select-only inference
    const innerType = `S extends ${model.name}Select
  ? { [K in keyof S as S[K] extends false | undefined ? never : K]: K extends keyof ${model.name} ? ResolveFieldSelect<${model.name}[K], S[K]> : never }
  : ${model.name}`;

    return `export type Get${model.name}Payload<
  S extends ${model.name}Select | undefined = undefined,
  I = undefined,
> = ${wrapCompute(innerType)};`;
  }

  // With relations - full inference
  const innerType = `S extends ${model.name}Select
  ? { [K in keyof S as S[K] extends false | undefined ? never : K]: K extends keyof ${model.name} ? ResolveFieldSelect<${model.name}[K], S[K]> : never }
    & Get${model.name}IncludePayload<I>
  : I extends ${model.name}Include
    ? ${model.name} & Get${model.name}IncludePayload<I>
    : ${model.name}`;

  return `export type Get${model.name}Payload<
  S extends ${model.name}Select | undefined = undefined,
  I extends ${model.name}Include | undefined = undefined,
> = ${wrapCompute(innerType)};`;
}

/**
 * Generate inline object unset fields for an object field.
 * Returns field definitions for optional sub-fields that can be individually unset.
 */
function generateObjectUnsetFields(objectInfo: ObjectFieldMetadata, indent: string = '  '): string[] {
  const fields: string[] = [];

  for (const field of objectInfo.fields) {
    // Skip readonly, relations, id, @now
    if (field.isReadonly || field.type === 'relation' || field.isId) continue;
    if (field.timestampDecorator === 'now') continue;

    const isOptional = !field.isRequired;

    if (field.type === 'object' && field.objectInfo) {
      const children = generateObjectUnsetFields(field.objectInfo, indent + '  ');
      const hasOptionalChildren = children.length > 0;

      if (isOptional && hasOptionalChildren) {
        fields.push(`${indent}${field.name}?: true | {\n${children.join('\n')}\n${indent}};`);
      } else if (isOptional) {
        fields.push(`${indent}${field.name}?: true;`);
      } else if (hasOptionalChildren) {
        fields.push(`${indent}${field.name}?: {\n${children.join('\n')}\n${indent}};`);
      }
    } else if (field.type === 'tuple' && field.tupleInfo) {
      const hasUnsetable = tupleHasUnsetableElements({
        name: field.tupleInfo.tupleName,
        elements: field.tupleInfo.elements,
      });
      const tupleName = field.tupleInfo.tupleName;

      if (isOptional && hasUnsetable) {
        fields.push(`${indent}${field.name}?: true | ${tupleName}Unset;`);
      } else if (isOptional) {
        fields.push(`${indent}${field.name}?: true;`);
      } else if (hasUnsetable) {
        fields.push(`${indent}${field.name}?: ${tupleName}Unset;`);
      }
    } else if (isOptional) {
      // Primitive/Record — only if optional
      fields.push(`${indent}${field.name}?: true;`);
    }
  }

  return fields;
}

/**
 * Generate Unset type for a model.
 *
 * Rules per field kind:
 * | Field kind        | Optional? | Has optional children? | Output                    |
 * |-------------------|-----------|------------------------|---------------------------|
 * | Primitive/Record  | yes       | N/A                    | `true`                    |
 * | Object            | yes       | yes                    | `true \| { ...children }` |
 * | Object            | yes       | no                     | `true`                    |
 * | Object            | no        | yes                    | `{ ...children }` only    |
 * | Object            | no        | no                     | skip                      |
 * | Tuple field       | yes       | has optional elements  | `true \| TupleUnset`      |
 * | Tuple field       | yes       | no optional elements   | `true`                    |
 * | Tuple field       | no        | has optional elements  | `TupleUnset` only         |
 * | Tuple field       | no        | no optional elements   | skip                      |
 * | @readonly, Rel, id| any       | any                    | skip                      |
 */
export function generateUnsetType(model: ModelMetadata): string {
  const fields: string[] = [];

  for (const field of model.fields) {
    // Skip: readonly, relation, id, @now (computed)
    if (field.isReadonly || field.type === 'relation' || field.isId) continue;
    if (field.timestampDecorator === 'now') continue;

    const isOptional = !field.isRequired;

    // Array fields: optional → true, required → skip. No sub-field unset for arrays.
    if (field.isArray) {
      if (isOptional) {
        fields.push(`  ${field.name}?: true;`);
      }
      continue;
    }

    if (field.type === 'object' && field.objectInfo) {
      const children = generateObjectUnsetFields(field.objectInfo);
      const hasOptionalChildren = children.length > 0;

      if (isOptional && hasOptionalChildren) {
        fields.push(`  ${field.name}?: true | {\n${children.join('\n')}\n  };`);
      } else if (isOptional) {
        fields.push(`  ${field.name}?: true;`);
      } else if (hasOptionalChildren) {
        fields.push(`  ${field.name}?: {\n${children.join('\n')}\n  };`);
      }
      continue;
    }

    if (field.type === 'tuple' && field.tupleInfo) {
      const hasUnsetable = tupleHasUnsetableElements({
        name: field.tupleInfo.tupleName,
        elements: field.tupleInfo.elements,
      });
      const tupleName = field.tupleInfo.tupleName;

      if (isOptional && hasUnsetable) {
        fields.push(`  ${field.name}?: true | ${tupleName}Unset;`);
      } else if (isOptional) {
        fields.push(`  ${field.name}?: true;`);
      } else if (hasUnsetable) {
        fields.push(`  ${field.name}?: ${tupleName}Unset;`);
      }
      continue;
    }

    // Primitive/Record — only optional fields
    if (isOptional) {
      fields.push(`  ${field.name}?: true;`);
    }
  }

  return `export type ${model.name}Unset = {\n${fields.join('\n')}\n};`;
}

/** Generate all derived types for a model */
export function generateDerivedTypes(
  model: ModelMetadata,
  registry?: ModelRegistry,
  objectRegistry?: ObjectRegistry,
): string {
  const types = [
    generateCreateType(model, objectRegistry),
    generateNestedCreateType(model),
    generateCreateInputType(model),
    generateUpdateType(model),
    generateUpdateInputType(model),
    generateUnsetType(model),
    generateSelectType(model),
    generateOrderByType(model),
  ];

  const includeType = generateIncludeType(model, registry);
  if (includeType) {
    types.push(includeType);
  }

  // Add relations type
  types.push(generateRelationsType(model, registry));

  // Add include payload helper type (only if model has relations)
  const includePayloadType = generateIncludePayloadType(model, registry);
  if (includePayloadType) {
    types.push(includePayloadType);
  }

  // Add GetPayload type
  types.push(generateGetPayloadType(model));

  return types.join('\n\n');
}

/** Generate derived types for all models */
export function generateAllDerivedTypes(
  models: ModelMetadata[],
  registry?: ModelRegistry,
  objectRegistry?: ObjectRegistry,
): string {
  return models.map((model) => generateDerivedTypes(model, registry, objectRegistry)).join('\n\n');
}

// Object-specific derived types have been moved to ./objects/derived-generator.ts
export {
  generateAllObjectDerivedTypes,
  generateObjectDerivedTypes,
  generateObjectOrderByType,
  generateObjectSelectType,
} from './objects/derived-generator';
