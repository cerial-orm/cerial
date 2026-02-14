/**
 * Import helpers - constants, resolvers, and statement generators for cross-type imports
 */

import type {
  LiteralMetadata,
  LiteralRegistry,
  ModelMetadata,
  ObjectMetadata,
  ObjectRegistry,
  TupleFieldMetadata,
  TupleMetadata,
  TupleRegistry,
} from '../../types';
import { literalNeedsInputType } from '../types/literals';
import { objectHasDefaultOrTimestamp, tupleHasObjectElementsDeep, tupleHasUnsetableElements } from '../types';

// ─── Import Constants ─────────────────────────────────────────────────────────

/** ts-toolbelt import for generated types */
export const TS_TOOLBELT_IMPORT = `import type { Object as O, Any as A } from 'ts-toolbelt';`;

/** CerialId import for Record type fields */
export const CERIAL_ID_IMPORT = `import { CerialId } from 'cerial';
import type { RecordIdInput } from 'cerial';`;

/** NONE sentinel import for nullable/optional update types */
export const NONE_IMPORT = `import type { CerialNone } from 'cerial';`;

/** DeleteUnique, UpdateUnique, Upsert, select utility types, SafeUnset, and CerialQueryPromise import for model files */
export const UNIQUE_TYPES_IMPORT = `import type { DeleteUniqueReturn, DeleteUniqueReturnType, UpdateUniqueReturn, UpdateUniqueReturnType, UpsertReturn, UpsertReturnType, UpsertArrayReturnType, ResolveFieldSelect, SafeUnset } from '..';
import type { CerialQueryPromise } from '..';`;

// ─── Import Resolvers ─────────────────────────────────────────────────────────

/** Get related model names from a model's relation fields */
export function getRelatedModelNames(model: ModelMetadata): string[] {
  const relatedModels = new Set<string>();

  for (const field of model.fields) {
    if (field.type === 'relation' && field.relationInfo?.targetModel) {
      relatedModels.add(field.relationInfo.targetModel);
    }
  }

  return Array.from(relatedModels);
}

/** Get referenced object names from a model's object fields */
export function getReferencedObjectNames(model: ModelMetadata): string[] {
  const objectNames = new Set<string>();

  for (const field of model.fields) {
    if (field.type === 'object' && field.objectInfo) {
      objectNames.add(field.objectInfo.objectName);
    }
  }

  return Array.from(objectNames);
}

/** Get referenced object names from an object's fields (for cross-object imports) */
export function getObjectReferencedObjectNames(object: ObjectMetadata): string[] {
  const objectNames = new Set<string>();

  for (const field of object.fields) {
    if (field.type === 'object' && field.objectInfo && field.objectInfo.objectName !== object.name) {
      objectNames.add(field.objectInfo.objectName);
    }
  }

  return Array.from(objectNames);
}

/**
 * Recursively collect all object names referenced by a tuple's elements.
 * Used to ensure files import object Input types that appear in the
 * inline array-form of the Update type (e.g., `[string, DeepMidObjInput]`).
 */
export function collectTupleObjectNamesDeep(
  tupleInfo: TupleFieldMetadata,
  visited: Set<string> = new Set(),
): Set<string> {
  const objectNames = new Set<string>();
  if (visited.has(tupleInfo.tupleName)) return objectNames;
  visited.add(tupleInfo.tupleName);

  for (const element of tupleInfo.elements) {
    if (element.type === 'object' && element.objectInfo) {
      objectNames.add(element.objectInfo.objectName);
    }
    if (element.type === 'tuple' && element.tupleInfo) {
      for (const name of collectTupleObjectNamesDeep(element.tupleInfo, visited)) {
        objectNames.add(name);
      }
    }
  }

  return objectNames;
}

/**
 * Recursively collect all tuple names referenced by a tuple's elements.
 * Used to ensure files import nested tuple Input types that appear in the
 * inline array-form of the Update type (e.g., `[string, DeepMidTupleInput]`).
 */
export function collectTupleTupleNamesDeep(
  tupleInfo: TupleFieldMetadata,
  visited: Set<string> = new Set(),
): Set<string> {
  const tupleNames = new Set<string>();
  if (visited.has(tupleInfo.tupleName)) return tupleNames;
  visited.add(tupleInfo.tupleName);

  for (const element of tupleInfo.elements) {
    if (element.type === 'tuple' && element.tupleInfo) {
      tupleNames.add(element.tupleInfo.tupleName);
      for (const name of collectTupleTupleNamesDeep(element.tupleInfo, visited)) {
        tupleNames.add(name);
      }
    }
  }

  return tupleNames;
}

/** Get referenced tuple names from a model's tuple fields */
export function getReferencedTupleNames(model: ModelMetadata): string[] {
  const tupleNames = new Set<string>();

  for (const field of model.fields) {
    if (field.type === 'tuple' && field.tupleInfo) {
      tupleNames.add(field.tupleInfo.tupleName);
    }
  }

  return Array.from(tupleNames);
}

/** Get referenced tuple names from an object's fields */
export function getObjectReferencedTupleNames(object: ObjectMetadata): string[] {
  const tupleNames = new Set<string>();

  for (const field of object.fields) {
    if (field.type === 'tuple' && field.tupleInfo) {
      tupleNames.add(field.tupleInfo.tupleName);
    }
  }

  return Array.from(tupleNames);
}

/** Get referenced object names from a tuple's elements */
export function getTupleReferencedObjectNames(tuple: TupleMetadata): string[] {
  const objectNames = new Set<string>();

  for (const element of tuple.elements) {
    if (element.type === 'object' && element.objectInfo) {
      objectNames.add(element.objectInfo.objectName);
    }
  }

  return Array.from(objectNames);
}

/** Get referenced tuple names from a tuple's elements (for cross-tuple imports) */
export function getTupleReferencedTupleNames(tuple: TupleMetadata): string[] {
  const tupleNames = new Set<string>();

  for (const element of tuple.elements) {
    if (element.type === 'tuple' && element.tupleInfo && element.tupleInfo.tupleName !== tuple.name) {
      tupleNames.add(element.tupleInfo.tupleName);
    }
  }

  return Array.from(tupleNames);
}

// ─── Condition Checkers ───────────────────────────────────────────────────────

/** Check if a model has any relation fields */
export function hasRelations(model: ModelMetadata): boolean {
  return model.fields.some((f) => f.type === 'relation' && f.relationInfo);
}

/** Check if a model's Update type needs CerialNone (has optional non-array non-id non-readonly fields) */
export function needsCerialNone(model: ModelMetadata): boolean {
  return model.fields.some((f) => {
    if (f.isId || f.isReadonly || f.type === 'relation' || f.isArray) return false;
    if (f.timestampDecorator === 'now') return false;
    // Optional non-array fields (object, tuple, or primitive) can be cleared with NONE
    if (!f.isRequired) return true;
    // Nullable non-array fields can be set to null (handled by | null, not CerialNone)
    // But nullable + optional needs CerialNone too — already covered above

    return false;
  });
}

/** Create a registry from model array */
export function createRegistryFromModels(models: ModelMetadata[]): Record<string, ModelMetadata> {
  const registry: Record<string, ModelMetadata> = {};
  for (const model of models) {
    registry[model.name] = model;
  }

  return registry;
}

// ─── Import Statement Generators ──────────────────────────────────────────────

/**
 * Generate import statements for related model types.
 * Models always import other models from the same directory.
 */
export function generateRelatedImports(relatedModels: string[], allModels: ModelMetadata[]): string {
  if (relatedModels.length === 0) return '';

  const imports = relatedModels.map((name) => {
    const fileName = name.toLowerCase();
    const relatedModel = allModels.find((m) => m.name === name);
    const hasInclude = relatedModel && hasRelations(relatedModel);

    // Import base model interface + Where, Select, OrderBy + NestedCreate + Include/IncludePayload if exists
    const baseImports = [name, `${name}Where`, `${name}Select`, `${name}OrderBy`, `${name}NestedCreate`];

    if (hasInclude) {
      baseImports.push(`${name}Include`, `Get${name}IncludePayload`);
    }

    return `import type { ${baseImports.join(', ')} } from './${fileName}';`;
  });

  return imports.join('\n') + '\n';
}

/**
 * Generate import statements for referenced object types.
 * @param importPrefix - Directory prefix for import path (default `'.'` for same directory, `'../objects'` for cross-directory)
 */
export function generateObjectImports(
  objectNames: string[],
  objectRegistry?: ObjectRegistry,
  importPrefix: string = '.',
): string {
  if (objectNames.length === 0) return '';

  const imports = objectNames.map((name) => {
    const fileName = name.toLowerCase();
    const importNames = [name, `${name}Input`, `${name}Where`, `${name}Select`, `${name}OrderBy`];

    // Import CreateInput if the object has @default/@now fields
    if (objectRegistry) {
      const objMeta = objectRegistry[name];
      if (objMeta && objectHasDefaultOrTimestamp(objMeta, objectRegistry)) {
        importNames.push(`${name}CreateInput`);
      }
    }

    return `import type { ${importNames.join(', ')} } from '${importPrefix}/${fileName}';`;
  });

  return imports.join('\n') + '\n';
}

/**
 * Generate import statements for referenced tuple types.
 * @param importPrefix - Directory prefix for import path (default `'.'` for same directory, `'../tuples'` for cross-directory)
 */
export function generateTupleImports(
  tupleNames: string[],
  tupleRegistry?: TupleRegistry,
  importPrefix: string = '.',
): string {
  if (tupleNames.length === 0) return '';

  const imports = tupleNames.map((name) => {
    const fileName = name.toLowerCase();
    const importNames = [name, `${name}Input`, `${name}Where`, `${name}Update`];

    if (tupleRegistry) {
      const tupleMeta = tupleRegistry[name];
      // Conditionally add Select import for tuples with object elements at any depth
      if (tupleMeta && tupleHasObjectElementsDeep(tupleMeta)) {
        importNames.push(`${name}Select`);
      }
      // Conditionally add Unset import for tuples with unsetable elements
      if (tupleMeta && tupleHasUnsetableElements(tupleMeta)) {
        importNames.push(`${name}Unset`);
      }
    }

    return `import type { ${importNames.join(', ')} } from '${importPrefix}/${fileName}';`;
  });

  return imports.join('\n') + '\n';
}

// ─── Literal Import Resolvers ─────────────────────────────────────────────────

/** Get referenced object names from a literal's objectRef variants */
export function getLiteralReferencedObjectNames(literal: LiteralMetadata): string[] {
  const objectNames = new Set<string>();

  for (const variant of literal.variants) {
    if (variant.kind === 'objectRef') {
      objectNames.add(variant.objectName);
    }
  }

  return Array.from(objectNames);
}

/** Get referenced tuple names from a literal's tupleRef variants */
export function getLiteralReferencedTupleNames(literal: LiteralMetadata): string[] {
  const tupleNames = new Set<string>();

  for (const variant of literal.variants) {
    if (variant.kind === 'tupleRef') {
      tupleNames.add(variant.tupleName);
    }
  }

  return Array.from(tupleNames);
}

/** Get referenced literal names from a model's literal fields */
export function getModelReferencedLiteralNames(model: ModelMetadata): string[] {
  const literalNames = new Set<string>();

  for (const field of model.fields) {
    if (field.type === 'literal' && field.literalInfo) {
      literalNames.add(field.literalInfo.literalName);
    }
  }

  return Array.from(literalNames);
}

/** Get referenced literal names from an object's literal fields */
export function getObjectReferencedLiteralNames(object: ObjectMetadata): string[] {
  const literalNames = new Set<string>();

  for (const field of object.fields) {
    if (field.type === 'literal' && field.literalInfo) {
      literalNames.add(field.literalInfo.literalName);
    }
  }

  return Array.from(literalNames);
}

/** Get referenced literal names from a tuple's literal elements */
export function getTupleReferencedLiteralNames(tuple: TupleMetadata): string[] {
  const literalNames = new Set<string>();

  for (const element of tuple.elements) {
    if (element.type === 'literal' && element.literalInfo) {
      literalNames.add(element.literalInfo.literalName);
    }
  }

  return Array.from(literalNames);
}

// ─── Literal Import Statement Generators ──────────────────────────────────────

/**
 * Generate import statements for referenced literal types (from model/object/tuple files).
 * @param importPrefix - Directory prefix for import path (e.g., `'../literals'` for cross-directory)
 */
export function generateLiteralImports(
  literalNames: string[],
  literalRegistry?: LiteralRegistry,
  importPrefix: string = '.',
): string {
  if (!literalNames.length) return '';

  const imports = literalNames.map((name) => {
    const fileName = name.toLowerCase();
    const importNames = [name, `${name}Where`];

    // Conditionally add Input type for literals with tupleRef/objectRef variants
    if (literalRegistry) {
      const litMeta = literalRegistry[name];
      if (litMeta && literalNeedsInputType(litMeta)) {
        importNames.push(`${name}Input`);
      }
    }

    return `import type { ${importNames.join(', ')} } from '${importPrefix}/${fileName}';`;
  });

  return imports.join('\n') + '\n';
}

/**
 * Generate import statements for object types referenced by a literal's objectRef variants.
 * Used inside literal type files.
 */
export function generateLiteralObjectImports(
  objectNames: string[],
  objectRegistry?: ObjectRegistry,
  importPrefix: string = '../objects',
): string {
  if (!objectNames.length) return '';

  const imports = objectNames.map((name) => {
    const fileName = name.toLowerCase();
    const importNames = [name, `${name}Input`];

    return `import type { ${importNames.join(', ')} } from '${importPrefix}/${fileName}';`;
  });

  return imports.join('\n') + '\n';
}

/**
 * Generate import statements for tuple types referenced by a literal's tupleRef variants.
 * Used inside literal type files.
 */
export function generateLiteralTupleImports(
  tupleNames: string[],
  tupleRegistry?: TupleRegistry,
  importPrefix: string = '../tuples',
): string {
  if (!tupleNames.length) return '';

  const imports = tupleNames.map((name) => {
    const fileName = name.toLowerCase();
    const importNames = [name, `${name}Input`];

    return `import type { ${importNames.join(', ')} } from '${importPrefix}/${fileName}';`;
  });

  return imports.join('\n') + '\n';
}
