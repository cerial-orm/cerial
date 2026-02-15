/**
 * Metadata types for model registry and field definitions
 */

import type { OnDeleteAction, SchemaFieldType } from './common.types';
import type { ASTLiteralVariantKind } from './parser.types';

/** Metadata for relation fields */
export interface RelationFieldMetadata {
  /** Target model name from @model(Model) decorator */
  targetModel: string;
  /** Target table name (snake_case of targetModel) */
  targetTable: string;
  /** Field reference from @field(fieldName) decorator - undefined for reverse relations */
  fieldRef?: string;
  /** Whether this is a reverse relation (no @field decorator) */
  isReverse: boolean;
  /** Delete action from @onDelete(Action) decorator - only valid on optional relations */
  onDelete?: OnDeleteAction;
  /** Key for disambiguation from @key(name) decorator - required when multiple relations to same model */
  key?: string;
}

/** Metadata for a single field in a model */
export interface FieldMetadata {
  /** Field name (e.g., "id", "email") */
  name: string;
  /** Field type (e.g., "string", "email", "int") */
  type: SchemaFieldType;
  /** Whether the field has @id decorator (SurrealDB record id) */
  isId: boolean;
  /** Whether the field has @unique decorator */
  isUnique: boolean;
  /** Whether the field has @index decorator */
  isIndexed?: boolean;
  /** Timestamp decorator: 'now' (computed), 'createdAt' (default), 'updatedAt' (default always) */
  timestampDecorator?: 'now' | 'createdAt' | 'updatedAt';
  /** UUID auto-generation decorator: 'uuid' (v7 default), 'uuid4' (v4), 'uuid7' (v7 explicit) */
  uuidDecorator?: 'uuid' | 'uuid4' | 'uuid7';
  /** Whether the field is required (no ? marker) */
  isRequired: boolean;
  /** Whether the field has @nullable decorator (can hold null as a value, distinct from NONE/absent) */
  isNullable?: boolean;
  /** Default value if specified with @default(value) */
  defaultValue?: unknown;
  /** Default-always value if specified with @defaultAlways(value) — resets on every write */
  defaultAlwaysValue?: unknown;
  /** Whether this is an array type (Record[]) */
  isArray?: boolean;
  /** Relation metadata for Relation type fields */
  relationInfo?: RelationFieldMetadata;
  /** Whether the field has @distinct decorator (for arrays) */
  isDistinct?: boolean;
  /** Sort order from @sort decorator: 'asc' (default) or 'desc' */
  sortOrder?: 'asc' | 'desc';
  /** Whether the field has @flexible decorator (for object-typed fields) */
  isFlexible?: boolean;
  /** Whether the field has @readonly decorator (write-once, excluded from update) */
  isReadonly?: boolean;
  /** Object metadata for object-typed fields */
  objectInfo?: ObjectFieldMetadata;
  /** Tuple metadata for tuple-typed fields */
  tupleInfo?: TupleFieldMetadata;
  /** Literal metadata for literal-typed fields */
  literalInfo?: LiteralFieldMetadata;
  /** Geometry subtype decorators: which geometry subtypes this field accepts */
  geometrySubtypes?: ('point' | 'line' | 'polygon' | 'multipoint' | 'multiline' | 'multipolygon' | 'collection')[];
}

/** Metadata for object-typed fields referencing an object definition */
export interface ObjectFieldMetadata {
  /** Name of the referenced object definition (e.g., "Address") */
  objectName: string;
  /** Inline copy of the object's fields for runtime query building */
  fields: FieldMetadata[];
}

/** Metadata for an object definition (embedded data structure) */
export interface ObjectMetadata {
  /** Object name (e.g., "Address") */
  name: string;
  /** Array of field metadata */
  fields: FieldMetadata[];
}

/** Registry of all objects indexed by object name */
export interface ObjectRegistry {
  [objectName: string]: ObjectMetadata;
}

/** Metadata for a single element in a tuple definition */
export interface TupleElementMetadata {
  /** Optional element name (for named tuples) */
  name?: string;
  /** Element index (0-based position) */
  index: number;
  /** Element type (e.g., 'string', 'int', 'float', 'object', 'tuple') */
  type: SchemaFieldType;
  /** Whether this element is optional */
  isOptional: boolean;
  /** Whether the element has @nullable decorator (can hold null as a value) */
  isNullable?: boolean;
  /** Default value if specified with @default(value) on the element */
  defaultValue?: unknown;
  /** Default-always value if specified with @defaultAlways(value) on the element */
  defaultAlwaysValue?: unknown;
  /** Timestamp decorator on the element: 'createdAt' or 'updatedAt' */
  timestampDecorator?: 'createdAt' | 'updatedAt';
  /** For object-typed elements: object metadata with inline fields */
  objectInfo?: ObjectFieldMetadata;
  /** For tuple-typed elements: tuple metadata with inline elements */
  tupleInfo?: TupleFieldMetadata;
  /** For literal-typed elements: literal metadata */
  literalInfo?: LiteralFieldMetadata;
}

/** Metadata for tuple-typed fields referencing a tuple definition */
export interface TupleFieldMetadata {
  /** Name of the referenced tuple definition (e.g., "Coordinate") */
  tupleName: string;
  /** Inline copy of the tuple's elements for runtime query building */
  elements: TupleElementMetadata[];
}

/** Metadata for a tuple definition (positional typed array) */
export interface TupleMetadata {
  /** Tuple name (e.g., "Coordinate") */
  name: string;
  /** Array of element metadata */
  elements: TupleElementMetadata[];
}

/** Registry of all tuples indexed by tuple name */
export interface TupleRegistry {
  [tupleName: string]: TupleMetadata;
}

/** Resolved variant in a literal definition (no literalRef — those are expanded) */
export type ResolvedLiteralVariant =
  | { kind: 'string'; value: string }
  | { kind: 'int'; value: number }
  | { kind: 'float'; value: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'broadType'; typeName: string }
  | { kind: 'tupleRef'; tupleName: string; tupleInfo: TupleFieldMetadata }
  | { kind: 'objectRef'; objectName: string; objectInfo: ObjectFieldMetadata };

/** Metadata for literal-typed fields referencing a literal definition */
export interface LiteralFieldMetadata {
  /** Name of the referenced literal definition (e.g., "Status") */
  literalName: string;
  /** Expanded variants (literal references resolved and deduplicated) */
  variants: ResolvedLiteralVariant[];
  /** Whether this literal originates from an enum definition */
  isEnum?: boolean;
}

/** Metadata for a literal definition (union type) */
export interface LiteralMetadata {
  /** Literal name (e.g., "Status") */
  name: string;
  /** Expanded variants (literal references resolved and deduplicated) */
  variants: ResolvedLiteralVariant[];
  /** Whether this literal originates from an enum definition */
  isEnum?: boolean;
}

/** Registry of all literals indexed by literal name */
export interface LiteralRegistry {
  [literalName: string]: LiteralMetadata;
}

/** Composite index/unique directive metadata */
export interface CompositeIndex {
  /** Whether this is a non-unique 'index' or a 'unique' composite */
  kind: 'index' | 'unique';
  /** User-defined name (globally unique across all models) */
  name: string;
  /** Field references (supports dot notation for object subfields) */
  fields: string[];
}

/** Metadata for a model/table */
export interface ModelMetadata {
  /** Model name (e.g., "User") */
  name: string;
  /** Table name in database (e.g., "user") */
  tableName: string;
  /** Array of field metadata */
  fields: FieldMetadata[];
  /** Model-level composite index/unique directives */
  compositeDirectives?: CompositeIndex[];
}

/** Registry of all models indexed by model name */
export interface ModelRegistry {
  [modelName: string]: ModelMetadata;
}

/** Connection configuration for runtime client */
export interface ConnectionConfig {
  /** Connection URL */
  url: string;
  /** Optional namespace */
  namespace?: string;
  /** Optional database name */
  database?: string;
  /** Authentication credentials */
  auth?: {
    username: string;
    password: string;
  };
}

/** Named connection for multi-connection support */
export interface NamedConnection {
  name: string;
  config: ConnectionConfig;
}
