/**
 * Test helpers
 * Provides utilities for writing tests using DSL instead of manual ModelRegistry construction
 */

import type { ModelRegistry, ModelMetadata } from '../src/types';
import { parse } from '../src/parser/parser';
import { astToRegistry } from '../src/parser/model-metadata';

/**
 * Parse a model DSL string and get the ModelRegistry
 * This ensures tests use actual parsing behavior instead of manual construction
 */
export function parseModelRegistry(dsl: string): ModelRegistry {
  const result = parse(dsl);

  if (result.errors.length > 0) {
    throw new Error(`Failed to parse model DSL: ${result.errors.map((e) => e.message).join(', ')}`);
  }

  return astToRegistry(result.ast);
}

/**
 * Get a single model from a DSL string
 */
export function parseModel(dsl: string, modelName: string): ModelMetadata {
  const registry = parseModelRegistry(dsl);
  const model = registry[modelName];

  if (!model) {
    throw new Error(`Model "${modelName}" not found in parsed registry`);
  }

  return model;
}
