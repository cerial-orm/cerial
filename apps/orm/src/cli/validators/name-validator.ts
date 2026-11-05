/**
 * Declaration name validator - one name per declaration across the schema, within and across kinds
 */

import {
  GROUP_BY_UTILITY_TYPES,
  RETURN_UTILITY_TYPES,
  SAFE_UNSET_TYPE,
  SELECT_UTILITY_TYPES,
} from '../../generators/client/utility-types';
import type { Origin, SchemaAST } from '../../types';
import { formatOrigin, located } from './origin-location';
import type { SchemaValidationError } from './schema-validator';

interface Named {
  name: string;
  origin: Origin;
}

function findDuplicates(kind: string, items: Named[]): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const seen = new Map<string, Origin>();

  for (const item of items) {
    const first = seen.get(item.name);
    if (first) {
      errors.push({
        message: `Duplicate ${kind} name: ${item.name} (declared in ${formatOrigin(first)} and in ${formatOrigin(item.origin)})`,
        ...located(item.origin),
      });
    } else {
      seen.set(item.name, item.origin);
    }
  }

  return errors;
}

/**
 * Reject a name used by two different kinds of declaration. Each later declaration is reported once,
 * against the first one that took the name. Abstract models are skipped: they are consumed by
 * inheritance resolution and leave no type behind, so nothing can collide with them.
 */
function findCrossKindCollisions(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const first = new Map<string, { kind: string; origin: Origin }>();
  const groups: Array<[string, Named[]]> = [
    ['model', ast.models.filter((m) => !m.abstract)],
    ['object', ast.objects],
    ['tuple', ast.tuples],
    ['literal', ast.literals],
    ['enum', ast.enums],
  ];

  for (const [kind, items] of groups) {
    for (const item of items) {
      const taken = first.get(item.name);
      if (!taken) {
        first.set(item.name, { kind, origin: item.origin });
      } else if (taken.kind !== kind) {
        errors.push({
          message: `Duplicate name: ${item.name} (declared as ${taken.kind} in ${formatOrigin(taken.origin)} and as ${kind} in ${formatOrigin(item.origin)})`,
          ...located(item.origin),
        });
      }
    }
  }

  return errors;
}

type DeclarationKind = 'model' | 'object' | 'tuple' | 'literal' | 'enum';

/**
 * Type names the generators append to a declaration name, read from `generators/types/**`. A declaration
 * whose name equals one of these for another declaration emits the same identifier twice. Kept to the
 * union per kind, so a suffix a kind does not emit today is refused rather than discovered later.
 */
export const DERIVED_SUFFIXES: Record<DeclarationKind, readonly string[]> = {
  model: [
    'Create',
    'CreateInput',
    'FindUniqueWhere',
    'GroupByArgs',
    'GroupByAggregates',
    'GroupByKeys',
    'GroupByOrderBy',
    'GroupByResult',
    'CountAggregate',
    'GroupAggregate',
    'MinMaxAggregate',
    'NumericAggregate',
    'Include',
    'IncludePayload',
    'Input',
    'Model',
    'NestedCreate',
    'OrderBy',
    'Payload',
    'Select',
    'SelectFields',
    'Unset',
    'Update',
    'UpdateInput',
    'Where',
    'WhereInput',
    'WithRelations',
  ],
  object: ['CreateInput', 'Input', 'OrderBy', 'Select', 'SelectFields', 'Where'],
  tuple: ['Input', 'Select', 'Unset', 'Update', 'Where'],
  literal: ['Input', 'Where'],
  enum: ['Enum', 'EnumType', 'EnumWhere', 'Where'],
};

/** Every kind has an `index` barrel in its own folder, so a declaration of that name loses its type */
const BARREL_NAME = 'index';

function declarationGroups(ast: SchemaAST): Array<[DeclarationKind, Named[]]> {
  return [
    ['model', ast.models.filter((m) => !m.abstract)],
    ['object', ast.objects],
    ['tuple', ast.tuples],
    ['literal', ast.literals],
    ['enum', ast.enums],
  ];
}

function findBarrelNames(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  for (const [kind, items] of declarationGroups(ast)) {
    for (const item of items) {
      if (item.name.toLowerCase() !== BARREL_NAME) continue;
      errors.push({
        message: `Reserved ${kind} name: ${item.name} (declared in ${formatOrigin(item.origin)}) collides with the generated index file`,
        ...located(item.origin),
      });
    }
  }

  return errors;
}

/** Type names the client template and the index writer always export, whatever the schema declares */
const STATIC_FIXED_EXPORTS: readonly string[] = [
  'CerialClient',
  'CerialClientConnectConfig',
  'ClientOptions',
  'ConnectionConfig',
  'TypedDb',
  'MigrationEventType',
  'MigrationEventCallback',
  'MigrationsMode',
  'CerialQueryPromise',
  'QueryResultType',
  'NONE',
  'CerialNone',
  'modelRegistry',
  'Compute',
  'Merge',
  'Optional',
  'Simplify',
  // Local aliases of ts-toolbelt imports in the generated type files
  'O',
  'A',
  // Imported from the package by generated files, so they share the module namespace
  'CerialUuid',
  'CerialUuidInput',
  'CerialGeometry',
  'CerialPoint',
  'CerialLineString',
  'CerialPolygon',
  'CerialMultiPoint',
  'CerialMultiLineString',
  'CerialMultiPolygon',
  'CerialGeometryCollection',
  'CerialGeometryInput',
  'CerialPointInput',
  'CerialLineStringInput',
  'CerialPolygonInput',
  'CerialMultiPointInput',
  'CerialMultiLineStringInput',
  'CerialMultiPolygonInput',
  'CerialGeometryCollectionInput',
  'CerialBytes',
  'CerialBytesInput',
  'CerialDecimal',
  'CerialDecimalInput',
  'CerialDuration',
  'CerialDurationInput',
  'TupleRegistry',
  'ObjectRegistry',
  'ModelRegistry',
  'LiteralRegistry',
  'CerialAny',
  'CerialId',
  'RecordIdInput',
  'SqlFragment',
  'CerialTransaction',
  'ModelMetadata',
  'CerialSet',
  'CerialError',
  'CerialMigrationError',
  'CerialNotConnectedError',
  'CerialTransactionError',
  'CerialValidationError',
  'ConnectionManager',
  'createClientLive',
  'createClientRawStatement',
  'executeClientTransaction',
  'beginTransaction',
  'validateBeginOptions',
  'applyUnmatched',
  'verifySchema',
  'warnAutoChange',
  'warnAutoInProduction',
  'blameModels',
  'matchedModels',
  'readLazyState',
  'LazyMigrationContext',
  'MigrationState',
  'createCerialTransactionProxy',
  'guardUnknownModels',
  'isTransactionConflict',
  'refuseNestedTransaction',
  'runInTransactionScope',
  'runRouted',
  'wrapDatabaseError',
  'CerialLiveHandle',
  'ClientLiveOptions',
  'DatabaseProxy',
  'BeforeQueryCallback',
  'PerModelCallbacks',
  'TransactionItem',
  'TransactionExecutionItem',
  'TransactionItemResult',
  'TransactionBeginOptions',
  'TransactionOptions',
  'TransactionClient',
  // Imported from the package by generated files, so they share the module namespace
];

const UTILITY_EXPORT = /^export (?:type|interface|const|class|function) ([A-Za-z_]\w*)/gm;

/** Names the generated client always exports: the fixed list plus every export of the shared utility types */
export const FIXED_EXPORTS: ReadonlySet<string> = new Set([
  ...STATIC_FIXED_EXPORTS,
  ...[SELECT_UTILITY_TYPES, SAFE_UNSET_TYPE, GROUP_BY_UTILITY_TYPES, RETURN_UTILITY_TYPES].flatMap((text) =>
    [...text.matchAll(UTILITY_EXPORT)].map((m) => m[1]!),
  ),
]);

/** Every type name the generators export for one declaration, its own name included */
export function derivedTypeNames(kind: DeclarationKind, name: string): string[] {
  return [
    name,
    ...DERIVED_SUFFIXES[kind].map((suffix) => `${name}${suffix}`),
    ...(kind === 'model' ? [`Get${name}Payload`, `Get${name}IncludePayload`] : []),
  ];
}

interface Producer {
  what: string;
  base: string;
  origin?: Origin;
}

/**
 * Reject a generated type name produced twice, ignoring case: by two declarations (`Post` with
 * `PostNested` through `PostNestedCreate`), or by a declaration and the generated client (`CerialClient`).
 * Names that differ only in case, and one name declared twice, are reported by their own checks.
 */
function findNamespaceCollisions(ast: SchemaAST, clientTypes: readonly string[]): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const produced = new Map<string, Array<Producer & { type: string }>>();
  const add = (type: string, producer: Producer): void => {
    const key = type.toLowerCase();
    produced.set(key, [...(produced.get(key) ?? []), { ...producer, type }]);
  };

  for (const type of [...FIXED_EXPORTS, ...clientTypes]) add(type, { what: 'the generated client', base: '' });
  for (const [kind, items] of declarationGroups(ast)) {
    for (const item of items) {
      const what = `${kind} ${item.name}, declared in ${formatOrigin(item.origin)}`;
      for (const type of derivedTypeNames(kind, item.name)) add(type, { what, base: item.name, origin: item.origin });
    }
  }

  for (const producers of produced.values()) {
    const [first, ...rest] = producers;
    for (const other of rest) {
      if (!first || first.base.toLowerCase() === other.base.toLowerCase()) continue;
      const located_ = other.origin ?? first.origin;
      errors.push({
        message: `Name collision: ${first.type} (generated for ${first.what}) and ${other.type} (generated for ${other.what}) are the same type name, ignoring case`,
        ...(located_ ? located(located_) : {}),
      });
    }
  }

  return errors;
}

/**
 * Reject names that differ only in case, across all kinds. Generated files are named after the lowercased
 * declaration name, so `Post` and `POST` would write one file and lose a type; this holds on case-sensitive
 * and case-insensitive filesystems alike because the rule is on the names, not the disk. Exact repeats are
 * left to the checks above.
 */
function findCaseCollisions(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const first = new Map<string, { kind: string; name: string; origin: Origin }>();
  const groups: Array<[string, Named[]]> = [
    ['model', ast.models.filter((m) => !m.abstract)],
    ['object', ast.objects],
    ['tuple', ast.tuples],
    ['literal', ast.literals],
    ['enum', ast.enums],
  ];

  for (const [kind, items] of groups) {
    for (const item of items) {
      const key = item.name.toLowerCase();
      const taken = first.get(key);
      if (!taken) {
        first.set(key, { kind, name: item.name, origin: item.origin });
      } else if (taken.name !== item.name) {
        errors.push({
          message: `Names differ only in case: ${taken.name} (${taken.kind}, declared in ${formatOrigin(taken.origin)}) and ${item.name} (${kind}, declared in ${formatOrigin(item.origin)}) generate the same file name`,
          ...located(item.origin),
        });
      }
    }
  }

  return errors;
}

/**
 * Reject two declarations sharing a name, of the same kind or of different kinds.
 *
 * Must run on the merged AST before inheritance resolution: the resolver keys types by name,
 * so two `User` models arrive as one and the second is silently dropped.
 */
export function validateDuplicateNames(ast: SchemaAST, clientClassName?: string): SchemaValidationError[] {
  return [
    ...findDuplicates('model', ast.models),
    ...findDuplicates('object', ast.objects),
    ...findDuplicates('tuple', ast.tuples),
    ...findDuplicates('literal', ast.literals),
    ...findDuplicates('enum', ast.enums),
    ...findCrossKindCollisions(ast),
    ...findCaseCollisions(ast),
    ...findBarrelNames(ast),
    ...findNamespaceCollisions(ast, clientClassName ? [clientClassName, `${clientClassName}ConnectConfig`] : []),
  ];
}
