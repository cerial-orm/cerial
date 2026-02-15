/**
 * Object interface generator - generates TypeScript interfaces for object definitions
 *
 * Generates up to three types for each object:
 * - Output interface (Address): CerialId for Record fields (what you get back from queries)
 * - Input interface (AddressInput): RecordIdInput for Record fields (what you can pass in)
 * - CreateInput interface (AddressCreateInput): Fields with @default/@now become optional (only when needed)
 */

import type { FieldMetadata, ObjectMetadata, ObjectRegistry } from '../../../types';
import { schemaTypeToTsType } from '../../../utils/type-utils';
import { getLiteralTypeName } from '../enums';
import { literalNeedsInputType } from '../literals';

/**
 * Get the TypeScript output type for a field
 * For Record fields, uses CerialId instead of string
 * For Object fields, uses the object's interface name
 */
function getOutputType(field: FieldMetadata): string {
  if (field.type === 'record') return 'CerialId';
  if (field.type === 'uuid') return 'CerialUuid';
  if (field.type === 'object' && field.objectInfo) return field.objectInfo.objectName;
  if (field.type === 'tuple' && field.tupleInfo) return field.tupleInfo.tupleName;
  if (field.type === 'literal' && field.literalInfo) return getLiteralTypeName(field.literalInfo);

  return schemaTypeToTsType(field.type);
}

/**
 * Get the TypeScript input type for a field
 * For Record fields, uses RecordIdInput instead of CerialId
 * For Object fields, uses the object's Input interface name
 * For Tuple fields, uses the tuple's Input type name
 * For Literal fields, uses the literal type name or Input variant
 */
function getInputType(field: FieldMetadata): string {
  if (field.type === 'record') return 'RecordIdInput';
  if (field.type === 'uuid') return 'CerialUuidInput';
  if (field.type === 'object' && field.objectInfo) return `${field.objectInfo.objectName}Input`;
  if (field.type === 'tuple' && field.tupleInfo) return `${field.tupleInfo.tupleName}Input`;
  if (field.type === 'literal' && field.literalInfo) {
    const lit = field.literalInfo;
    if (lit.isEnum) return getLiteralTypeName(lit);
    if (literalNeedsInputType({ name: lit.literalName, variants: lit.variants })) return `${lit.literalName}Input`;

    return lit.literalName;
  }

  return schemaTypeToTsType(field.type);
}

/**
 * Get the TypeScript create input type for a field
 * Same as getInputType but uses CreateInput for nested objects that have @default/@now fields
 */
function getCreateInputType(field: FieldMetadata, objectRegistry?: ObjectRegistry): string {
  if (field.type === 'record') return 'RecordIdInput';
  if (field.type === 'uuid') return 'CerialUuidInput';
  if (field.type === 'object' && field.objectInfo && objectRegistry) {
    const nested = objectRegistry[field.objectInfo.objectName];
    if (nested && objectHasDefaultOrTimestamp(nested, objectRegistry)) {
      return `${field.objectInfo.objectName}CreateInput`;
    }

    return `${field.objectInfo.objectName}Input`;
  }
  // Tuples don't have CreateInput — always use Input
  if (field.type === 'tuple' && field.tupleInfo) return `${field.tupleInfo.tupleName}Input`;
  // Literals/enums don't have CreateInput — use Input when has refs, otherwise output type
  if (field.type === 'literal' && field.literalInfo) {
    const lit = field.literalInfo;
    if (lit.isEnum) return getLiteralTypeName(lit);
    if (literalNeedsInputType({ name: lit.literalName, variants: lit.variants })) return `${lit.literalName}Input`;

    return lit.literalName;
  }

  return schemaTypeToTsType(field.type);
}

/**
 * Check if an object has any Record fields (determines if Input differs from Output)
 */
export function objectHasRecordFields(
  object: ObjectMetadata,
  objectRegistry?: ObjectRegistry,
  visited: Set<string> = new Set(),
): boolean {
  for (const field of object.fields) {
    if (field.type === 'record') return true;
    // Check nested objects recursively (with cycle detection for self-referencing objects)
    if (field.type === 'object' && field.objectInfo && objectRegistry) {
      const nestedName = field.objectInfo.objectName;
      if (visited.has(nestedName)) continue;
      const nested = objectRegistry[nestedName];
      if (nested) {
        const nextVisited = new Set(visited);
        nextVisited.add(nestedName);
        if (objectHasRecordFields(nested, objectRegistry, nextVisited)) return true;
      }
    }
  }

  return false;
}

/**
 * Check if an object has any fields with @default or timestamp decorators (direct or nested)
 * that require a separate CreateInput type where those fields are optional.
 *
 * @now fields are COMPUTED (output-only) and are omitted from CreateInput entirely.
 * @createdAt and @updatedAt fields are optional in CreateInput (DB fills them).
 */
export function objectHasDefaultOrTimestamp(
  object: ObjectMetadata,
  objectRegistry?: ObjectRegistry,
  visited: Set<string> = new Set(),
): boolean {
  for (const field of object.fields) {
    if (field.defaultValue !== undefined) return true;
    // @defaultAlways needs CreateInput (fields are optional, DB fills via DEFAULT ALWAYS)
    if (field.defaultAlwaysValue !== undefined) return true;
    // @createdAt and @updatedAt need CreateInput (fields are optional)
    if (field.timestampDecorator === 'createdAt' || field.timestampDecorator === 'updatedAt') return true;
    // @now needs CreateInput too (fields are omitted entirely)
    if (field.timestampDecorator === 'now') return true;
    // @uuid/@uuid4/@uuid7 need CreateInput (fields are optional, DB auto-generates)
    if (field.uuidDecorator) return true;
    // Check nested objects recursively (with cycle detection for self-referencing objects)
    if (field.type === 'object' && field.objectInfo && objectRegistry) {
      const nestedName = field.objectInfo.objectName;
      if (visited.has(nestedName)) continue;
      const nested = objectRegistry[nestedName];
      if (nested) {
        const nextVisited = new Set(visited);
        nextVisited.add(nestedName);
        if (objectHasDefaultOrTimestamp(nested, objectRegistry, nextVisited)) return true;
      }
    }
  }

  return false;
}

/** Wrap a type with Record<string, any> intersection for @flexible fields */
function wrapFlexible(type: string, field: FieldMetadata, isArray?: boolean): string {
  if (!field.isFlexible) return isArray ? `${type}[]` : type;
  if (isArray) return `(${type} & Record<string, any>)[]`;

  return `${type} & Record<string, any>`;
}

/** Generate output interface for an object definition */
export function generateObjectInterface(object: ObjectMetadata): string {
  const fields = object.fields
    .map((f) => {
      const tsType = getOutputType(f);
      if (f.isArray) return `  ${f.name}: ${wrapFlexible(tsType, f, true)};`;
      const optional = f.isRequired ? '' : '?';
      // @nullable adds | null (distinct from optional/NONE)
      // Object and tuple fields cannot be @nullable (validated in Phase 2)
      const type = f.isNullable ? `${tsType} | null` : tsType;

      return `  ${f.name}${optional}: ${wrapFlexible(type, f)};`;
    })
    .join('\n');

  return `export interface ${object.name} {
${fields}
}`;
}

/** Generate input interface for an object definition */
export function generateObjectInputInterface(object: ObjectMetadata, objectRegistry?: ObjectRegistry): string {
  // If object has no Record fields (direct or nested), input is identical to output
  const hasRecords = objectHasRecordFields(object, objectRegistry);

  const fields = object.fields
    .map((f) => {
      // Always use getInputType for input interfaces — tuple input types differ from output types
      const tsType = getInputType(f);
      if (f.isArray) return `  ${f.name}: ${wrapFlexible(tsType, f, true)};`;
      const optional = f.isRequired ? '' : '?';
      // @nullable adds | null (distinct from optional/NONE)
      // Object and tuple fields cannot be @nullable (validated in Phase 2)
      const type = f.isNullable ? `${tsType} | null` : tsType;

      return `  ${f.name}${optional}: ${wrapFlexible(type, f)};`;
    })
    .join('\n');

  return `export interface ${object.name}Input {
${fields}
}`;
}

/**
 * Generate CreateInput interface for an object definition
 * Only generated when the object has @default or @now fields (direct or nested)
 * Fields with @default/@now become optional, matching model Create type behavior
 */
export function generateObjectCreateInputInterface(object: ObjectMetadata, objectRegistry?: ObjectRegistry): string {
  const hasRecords = objectHasRecordFields(object, objectRegistry);

  const fields = object.fields
    .filter((f) => {
      // @now (COMPUTED) fields are output-only — excluded from CreateInput entirely
      return f.timestampDecorator !== 'now';
    })
    .map((f) => {
      const tsType = hasRecords ? getCreateInputType(f, objectRegistry) : getCreateInputType(f, objectRegistry);

      if (f.isArray) {
        // Array fields are optional in create (default to [])
        return `  ${f.name}?: ${tsType}[];`;
      }

      // Fields with @default, @defaultAlways, or @createdAt/@updatedAt are optional in create (DB fills them)
      const hasDefault =
        f.defaultValue !== undefined ||
        f.defaultAlwaysValue !== undefined ||
        f.timestampDecorator === 'createdAt' ||
        f.timestampDecorator === 'updatedAt' ||
        !!f.uuidDecorator;
      const optional = !f.isRequired || hasDefault ? '?' : '';
      // @nullable adds | null (distinct from optional/NONE)
      // Object and tuple fields cannot be @nullable (validated in Phase 2)
      const type = f.isNullable ? `${tsType} | null` : tsType;

      return `  ${f.name}${optional}: ${type};`;
    })
    .join('\n');

  return `export interface ${object.name}CreateInput {
${fields}
}`;
}

/** Generate interfaces for all objects (output, input, and optionally createInput) */
export function generateObjectInterfaces(objects: ObjectMetadata[], objectRegistry?: ObjectRegistry): string {
  if (!objects.length) return '';

  const interfaces: string[] = [];
  for (const object of objects) {
    interfaces.push(generateObjectInterface(object));
    interfaces.push(generateObjectInputInterface(object, objectRegistry));
    // Only generate CreateInput when the object has @default or timestamp fields
    if (objectHasDefaultOrTimestamp(object, objectRegistry)) {
      interfaces.push(generateObjectCreateInputInterface(object, objectRegistry));
    }
  }

  return interfaces.join('\n\n');
}
