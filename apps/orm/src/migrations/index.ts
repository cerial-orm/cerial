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
