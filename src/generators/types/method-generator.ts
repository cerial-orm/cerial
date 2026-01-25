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

/** Generate create method signature */
export function generateCreateMethod(model: ModelMetadata): string {
  return `create(options: {
    data: ${model.name}Create;
    select?: ${model.name}Select;
  }): Promise<${model.name}>;`;
}

/** Generate update method signature */
export function generateUpdateMethod(model: ModelMetadata): string {
  return `update(options: {
    where: ${model.name}Where;
    data: ${model.name}Update;
    select?: ${model.name}Select;
  }): Promise<${model.name}[]>;`;
}

/** Generate delete method signature */
export function generateDeleteMethod(model: ModelMetadata): string {
  return `delete(options: {
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
    generateCreateMethod(model),
    generateUpdateMethod(model),
    generateDeleteMethod(model),
    generateCountMethod(model),
    generateExistsMethod(model),
  ];
}
