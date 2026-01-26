/**
 * Method generator - generates query method signatures
 */

import type { ModelMetadata } from '../../types';

/** Generate findOne method signature */
export function generateFindOneMethod(model: ModelMetadata): string {
  return `findOne(options?: {
    where?: ${model.name}Where;
    select?: ${model.name}Select;
  }): Promise<${model.name} | null>;`;
}

/** Generate findMany method signature */
export function generateFindManyMethod(model: ModelMetadata): string {
  return `findMany(options?: {
    where?: ${model.name}Where;
    select?: ${model.name}Select;
    orderBy?: ${model.name}OrderBy;
    limit?: number;
    offset?: number;
  }): Promise<${model.name}[]>;`;
}

/** Generate findUnique method signature */
export function generateFindUniqueMethod(model: ModelMetadata): string {
  return `findUnique(options: {
    where: { id: string } & Omit<${model.name}Where, 'id'>;
    select?: ${model.name}Select;
  }): Promise<${model.name} | null>;`;
}

/** Generate create method signature */
export function generateCreateMethod(model: ModelMetadata): string {
  return `create(options: {
    data: ${model.name}Create;
    select?: ${model.name}Select;
  }): Promise<${model.name}>;`;
}

/** Generate updateMany method signature */
export function generateUpdateMethod(model: ModelMetadata): string {
  return `updateMany(options: {
    where: ${model.name}Where;
    data: ${model.name}Update;
    select?: ${model.name}Select;
  }): Promise<${model.name}[]>;`;
}

/** Generate deleteMany method signature */
export function generateDeleteManyMethod(model: ModelMetadata): string {
  return `deleteMany(options: {
    where: ${model.name}Where;
  }): Promise<number>;`;
}

/** Generate count method signature */
export function generateCountMethod(model: ModelMetadata): string {
  return `count(where?: ${model.name}Where): Promise<number>;`;
}

/** Generate exists method signature */
export function generateExistsMethod(model: ModelMetadata): string {
  return `exists(where: ${model.name}Where): Promise<boolean>;`;
}

/** Generate all method signatures for a model */
export function generateMethodSignatures(model: ModelMetadata): string[] {
  return [
    generateFindOneMethod(model),
    generateFindManyMethod(model),
    generateFindUniqueMethod(model),
    generateCreateMethod(model),
    generateUpdateMethod(model),
    generateDeleteManyMethod(model),
    generateCountMethod(model),
    generateExistsMethod(model),
  ];
}
