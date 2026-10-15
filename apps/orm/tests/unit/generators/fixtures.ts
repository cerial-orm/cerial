/**
 * Metadata builders shared by the import-helpers and method-generator unit tests
 */

import type {
  FieldMetadata,
  LiteralFieldMetadata,
  LiteralMetadata,
  ModelMetadata,
  ObjectMetadata,
  ResolvedLiteralVariant,
  TupleElementMetadata,
  TupleFieldMetadata,
  TupleMetadata,
} from '../../../src/types';

export function field(overrides: Partial<FieldMetadata> & { name: string }): FieldMetadata {
  return {
    type: 'string',
    isId: false,
    isUnique: false,
    isRequired: true,
    ...overrides,
  };
}

export function model(name: string, fields: FieldMetadata[], extra: Partial<ModelMetadata> = {}): ModelMetadata {
  return { name, tableName: name.toLowerCase(), fields, ...extra };
}

export function object(name: string, fields: FieldMetadata[]): ObjectMetadata {
  return { name, fields };
}

export function element(index: number, type: TupleElementMetadata['type'], extra: Partial<TupleElementMetadata> = {}) {
  return { index, type, isOptional: false, ...extra } satisfies TupleElementMetadata;
}

export function tupleInfo(tupleName: string, elements: TupleElementMetadata[]): TupleFieldMetadata {
  return { tupleName, elements };
}

export function tuple(name: string, elements: TupleElementMetadata[]): TupleMetadata {
  return { name, elements };
}

export function relationField(name: string, targetModel: string): FieldMetadata {
  return field({
    name,
    type: 'relation',
    relationInfo: { targetModel, targetTable: targetModel.toLowerCase(), isReverse: false },
  });
}

export function objectField(name: string, objectName: string, extra: Partial<FieldMetadata> = {}): FieldMetadata {
  return field({ name, type: 'object', objectInfo: { objectName, fields: [] }, ...extra });
}

export function tupleField(name: string, tupleName: string, extra: Partial<FieldMetadata> = {}): FieldMetadata {
  return field({ name, type: 'tuple', tupleInfo: tupleInfo(tupleName, []), ...extra });
}

export function literalInfo(
  literalName: string,
  variants: ResolvedLiteralVariant[] = [],
  isEnum?: boolean,
): LiteralFieldMetadata {
  return { literalName, variants, ...(isEnum === undefined ? {} : { isEnum }) };
}

export function literalField(name: string, info: LiteralFieldMetadata): FieldMetadata {
  return field({ name, type: 'literal', literalInfo: info });
}

export function literal(name: string, variants: ResolvedLiteralVariant[], isEnum?: boolean): LiteralMetadata {
  return { name, variants, ...(isEnum === undefined ? {} : { isEnum }) };
}
