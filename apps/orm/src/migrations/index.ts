export { acceptsNone, buildFieldModel, canonicalExpression, canonicalType, type FieldInput } from './canonical';
export type {
  DifferenceClass,
  FieldModel,
  FieldPath,
  FieldPathSegment,
  IndexModel,
  SchemaModel,
  TableModel,
  UnmanagedItem,
} from './types';
export { buildDesiredSchema } from './desired';
export { parseFieldIdiom, quoteFieldPath, quoteIdent } from './quote';
export { commentOut, sanitiseReason } from './comment';
export { emitRemove } from './emit-remove';
export { readLiveSchema } from './reader';
export { classifyDifference, diffSchema, type DiffOptions, type DifferenceKind, type SchemaDifference } from './diff';
export {
  buildMigrationPlan,
  indexDesiredStatements,
  type DesiredStatements,
  type MigrationPlan,
  type MigrationPlanItem,
} from './plan';
export { findDrift, type DriftItem, type DriftReport } from './drift';
export { bootstrapStateTables, MIGRATION_LEASE_TABLE, MIGRATIONS_TABLE } from './state-tables';
export { fingerprint, liveFingerprint, schemaFingerprint } from './fingerprint';
export {
  buildModelStateWrite,
  buildSchemaStateWrite,
  readState,
  writeModelState,
  writeSchemaState,
  type MigrationState,
  type MigrationStatus,
  type ModelState,
  type ModelStateInput,
  type SchemaState,
  type SchemaStateInput,
  type StatePiece,
} from './state';
export { acquireLease, buildHolderCheck, withLease, type LeaseOptions, type MigrationLease } from './lease';
export { applyPlan, type ApplyModel, type ApplyOptions, type ApplyResult } from './apply';
export {
  applyUnmatched,
  blameModels,
  matchedModels,
  readLazyState,
  type LazyMigrationContext,
  type LazyModel,
} from './lazy';
export { warnAutoChange, warnAutoInProduction, resetProductionWarning, type AutoChangeInput } from './warnings';
