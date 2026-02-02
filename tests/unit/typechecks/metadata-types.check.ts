/**
 * Type checks for metadata types
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { Test } from 'ts-toolbelt';
import type {
  FieldMetadata,
  ModelMetadata,
  ModelRegistry,
  RelationFieldMetadata,
  ConnectionConfig,
} from '../../../src/types';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// RelationFieldMetadata
// =============================================================================

Test.checks([
  // Required fields
  Test.check<RelationFieldMetadata['targetModel'], string, Test.Pass>(),
  Test.check<RelationFieldMetadata['targetTable'], string, Test.Pass>(),
  Test.check<RelationFieldMetadata['isReverse'], boolean, Test.Pass>(),

  // Optional fields
  Test.check<
    RelationFieldMetadata['fieldRef'],
    string | undefined,
    Test.Pass
  >(),
  Test.check<
    RelationFieldMetadata['onDelete'],
    'Cascade' | 'SetNull' | 'Restrict' | 'NoAction' | undefined,
    Test.Pass
  >(),
  Test.check<RelationFieldMetadata['key'], string | undefined, Test.Pass>(),
]);

// =============================================================================
// FieldMetadata
// =============================================================================

Test.checks([
  // Required fields
  Test.check<FieldMetadata['name'], string, Test.Pass>(),
  Test.check<FieldMetadata['type'], string, Test.Pass>(),
  Test.check<FieldMetadata['isId'], boolean, Test.Pass>(),
  Test.check<FieldMetadata['isUnique'], boolean, Test.Pass>(),
  Test.check<FieldMetadata['hasNowDefault'], boolean, Test.Pass>(),
  Test.check<FieldMetadata['isRequired'], boolean, Test.Pass>(),

  // Optional fields
  Test.check<FieldMetadata['defaultValue'], unknown, Test.Pass>(),
  Test.check<FieldMetadata['isArray'], boolean | undefined, Test.Pass>(),
  Test.check<
    FieldMetadata['relationInfo'],
    RelationFieldMetadata | undefined,
    Test.Pass
  >(),
]);

// FieldMetadata should be constructible with required fields only
type MinimalField = {
  name: string;
  type: 'string';
  isId: boolean;
  isUnique: boolean;
  hasNowDefault: boolean;
  isRequired: boolean;
};
Test.checks([Test.check<Extends<MinimalField, FieldMetadata>, 1, Test.Pass>()]);

// =============================================================================
// ModelMetadata
// =============================================================================

Test.checks([
  Test.check<ModelMetadata['name'], string, Test.Pass>(),
  Test.check<ModelMetadata['tableName'], string, Test.Pass>(),
  Test.check<ModelMetadata['fields'], FieldMetadata[], Test.Pass>(),
]);

// ModelMetadata should be constructible
type MinimalModel = {
  name: string;
  tableName: string;
  fields: FieldMetadata[];
};
Test.checks([Test.check<Extends<MinimalModel, ModelMetadata>, 1, Test.Pass>()]);

// =============================================================================
// ModelRegistry
// =============================================================================

// Registry should be indexable by string
type RegistryIndexResult = ModelRegistry[string];
Test.checks([
  Test.check<RegistryIndexResult, ModelMetadata | undefined, Test.Pass>(),
]);

// Registry should accept model metadata
type SampleRegistry = {
  User: ModelMetadata;
  Post: ModelMetadata;
};
Test.checks([
  Test.check<Extends<SampleRegistry, ModelRegistry>, 1, Test.Pass>(),
]);

// =============================================================================
// ConnectionConfig
// =============================================================================

Test.checks([
  // Required field
  Test.check<ConnectionConfig['url'], string, Test.Pass>(),

  // Optional fields
  Test.check<ConnectionConfig['namespace'], string | undefined, Test.Pass>(),
  Test.check<ConnectionConfig['database'], string | undefined, Test.Pass>(),
  Test.check<
    ConnectionConfig['auth'],
    { username: string; password: string } | undefined,
    Test.Pass
  >(),
]);

// Minimal connection config
type MinimalConfig = { url: string };
Test.checks([
  Test.check<Extends<MinimalConfig, ConnectionConfig>, 1, Test.Pass>(),
]);

// Full connection config
type FullConfig = {
  url: string;
  namespace: string;
  database: string;
  auth: { username: string; password: string };
};
Test.checks([
  Test.check<Extends<FullConfig, ConnectionConfig>, 1, Test.Pass>(),
]);
