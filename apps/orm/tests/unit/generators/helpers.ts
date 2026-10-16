import type { ObjectMetadata, TupleElementMetadata, TupleFieldMetadata, TupleMetadata } from '../../../src/types';
import type { FieldMetadata, ModelMetadata } from '../../../src/types/metadata.types';

export function field(overrides: Partial<FieldMetadata>): FieldMetadata {
  return {
    name: 'test',
    type: 'string',
    isId: false,
    isUnique: false,
    isRequired: true,
    ...overrides,
  };
}

export function model(name: string, tableName: string, fields: FieldMetadata[]): ModelMetadata {
  return { name, tableName, fields };
}

export function elem(
  overrides: Partial<TupleElementMetadata> & { index: number; type: TupleElementMetadata['type'] },
): TupleElementMetadata {
  return {
    isOptional: false,
    ...overrides,
  };
}

export function ti(tupleName: string, elements: TupleElementMetadata[]): TupleFieldMetadata {
  return { tupleName, elements };
}

export function mdl(name: string, tableName: string, fields: FieldMetadata[]): ModelMetadata {
  return { name, tableName, fields };
}

export function obj(name: string, fields: FieldMetadata[]): ObjectMetadata {
  return { name, fields };
}

export function tupleInfo(tupleName: string, elements: TupleElementMetadata[]): TupleFieldMetadata {
  return { tupleName, elements };
}

export function tuple(name: string, elements: TupleElementMetadata[]): TupleMetadata {
  return { name, elements };
}
