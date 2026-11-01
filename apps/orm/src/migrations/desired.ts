import {
  generateAssertClause,
  generateComputedClause,
  generateDefaultClause,
  generateIdTypeClause,
  generateLiteralSurrealType,
  generateTupleSurrealTypeLiteral,
  generateTypeClause,
  generateValueClause,
  mapToSurrealType,
} from '../generators/migrations';
import type {
  FieldMetadata,
  LiteralRegistry,
  ModelMetadata,
  ModelRegistry,
  ObjectMetadata,
  ObjectRegistry,
  TupleFieldMetadata,
  TupleRegistry,
} from '../types';
import { buildFieldModel } from './canonical';
import { parseFieldIdiom } from './quote';
import type { FieldModel, IndexModel, SchemaModel, TableModel } from './types';

interface Context {
  readonly objectRegistry: ObjectRegistry;
  readonly tupleRegistry: TupleRegistry;
  readonly literalRegistry: LiteralRegistry;
}

interface Decorators {
  readonly timestampDecorator?: 'now' | 'createdAt' | 'updatedAt';
  readonly defaultValue?: unknown;
  readonly defaultAlwaysValue?: unknown;
  readonly uuidDecorator?: 'uuid' | 'uuid4' | 'uuid7';
}

const withoutPrefix = (clause: string | undefined, prefix: string): string | undefined => clause?.slice(prefix.length);

/** Paths are assembled as the emitter writes them and parsed once, so both sides share `parseFieldIdiom`'s shape. */
function fieldModel(
  path: string,
  kind: string,
  decorators: Decorators,
  extra: { value?: string; assert?: string; readonly?: boolean; flexible?: boolean } = {},
): FieldModel {
  const clause = generateDefaultClause(
    decorators.timestampDecorator,
    decorators.defaultValue,
    decorators.defaultAlwaysValue,
    decorators.uuidDecorator,
  );
  const always = clause?.startsWith('DEFAULT ALWAYS ') ?? false;

  return buildFieldModel({
    path: parseFieldIdiom(path),
    kind,
    default: withoutPrefix(clause, always ? 'DEFAULT ALWAYS ' : 'DEFAULT '),
    defaultAlways: always,
    ...extra,
  });
}

function objectHasCycles(
  objectName: string,
  objectRegistry: ObjectRegistry,
  visited: Set<string> = new Set(),
): boolean {
  if (visited.has(objectName)) return true;
  const object = objectRegistry[objectName];
  if (!object) return false;
  visited.add(objectName);

  return object.fields.some(
    (field) =>
      field.type === 'object' &&
      !!field.objectInfo &&
      objectHasCycles(field.objectInfo.objectName, objectRegistry, new Set(visited)),
  );
}

const objectKind = (field: { isArray?: boolean; isRequired: boolean }): string =>
  field.isArray ? 'array<object>' : field.isRequired ? 'object' : 'option<object>';

function objectSubFields(
  path: string,
  object: ObjectMetadata,
  context: Context,
  visited: ReadonlySet<string>,
  fields: FieldModel[],
  indexes: IndexModel[],
  table: string,
): void {
  for (const sub of object.fields) {
    const subPath = `${path}.${sub.name}`;

    if (sub.type === 'object' && sub.objectInfo) {
      const name = sub.objectInfo.objectName;
      if (visited.has(name)) {
        fields.push(fieldModel(subPath, `${objectKind(sub)}`, {}, { flexible: true }));
        continue;
      }

      fields.push(fieldModel(subPath, objectKind(sub), {}, { flexible: sub.isFlexible, readonly: sub.isReadonly }));
      const nested = context.objectRegistry[name];
      if (nested) {
        objectSubFields(
          sub.isArray ? `${subPath}.*` : subPath,
          nested,
          context,
          new Set(visited).add(name),
          fields,
          indexes,
          table,
        );
      }
      continue;
    }

    if (sub.isUnique || sub.isIndexed) {
      // The name drops `.*` steps and joins with `_`, as the emitter names it.
      const suffix = sub.isUnique ? 'unique' : 'index';
      indexes.push({
        name: `${table}_${subPath.replace(/\.\*/g, '').replace(/\./g, '_')}_${suffix}`,
        columns: [parseFieldIdiom(subPath)],
        index: sub.isUnique ? 'UNIQUE' : '',
      });
    }

    // SurrealDB requires COMPUTED fields to be top level, so a sub-field @now is never defined.
    if (sub.timestampDecorator === 'now') continue;

    let kind: string;
    if (!sub.isArray) {
      kind = withoutPrefix(generateTypeClause(sub.type, sub.isRequired, sub), 'TYPE ')!;
    } else if (sub.type === 'any') {
      kind = 'array';
    } else if (sub.type === 'literal' && sub.literalInfo) {
      kind = `array<${generateLiteralSurrealType(sub.literalInfo)}>`;
    } else {
      kind = `array<${mapToSurrealType(sub.type)}>`;
    }

    const operations: string[] = [];
    if (sub.isArray && sub.isDistinct) operations.push('.distinct()');
    if (sub.isArray && sub.sortOrder) operations.push(sub.sortOrder === 'desc' ? '.sort(false)' : '.sort(true)');

    fields.push(
      fieldModel(subPath, kind, sub, {
        value: operations.length ? `IF $value THEN $value${operations.join('')} ELSE [] END` : undefined,
        assert: withoutPrefix(generateAssertClause(sub.type, sub.isArray), 'ASSERT '),
        readonly: sub.isReadonly,
      }),
    );
  }
}

function wrapElement(base: string, optional: boolean, nullable: boolean | undefined): string {
  if (!optional) return nullable ? `${base} | null` : base;

  return nullable ? `option<${base} | null>` : `option<${base}>`;
}

function tupleElements(
  path: string,
  tuple: TupleFieldMetadata,
  context: Context,
  visited: ReadonlySet<string>,
  fields: FieldModel[],
  indexes: IndexModel[],
  table: string,
): void {
  for (const element of tuple.elements) {
    const elementPath = `${path}[${element.index}]`;

    if (element.type === 'tuple' && element.tupleInfo) {
      const key = `tuple:${element.tupleInfo.tupleName}`;
      if (visited.has(key)) continue;

      const literal = generateTupleSurrealTypeLiteral(element.tupleInfo, context.tupleRegistry);
      fields.push(fieldModel(elementPath, wrapElement(literal, !!element.isOptional, element.isNullable), element));
      tupleElements(elementPath, element.tupleInfo, context, new Set(visited).add(key), fields, indexes, table);
    } else if (element.type === 'object' && element.objectInfo) {
      const name = element.objectInfo.objectName;
      const key = `object:${name}`;
      if (visited.has(key)) continue;

      fields.push(fieldModel(elementPath, element.isOptional ? 'option<object>' : 'object', element));
      const object = context.objectRegistry[name];
      if (object) {
        // The emitter collects sub-field indexes for model object fields only, never under a tuple.
        objectSubFields(elementPath, object, context, new Set(visited).add(key), fields, [], table);
      }
    } else if (
      element.timestampDecorator ||
      element.defaultValue !== undefined ||
      element.defaultAlwaysValue !== undefined
    ) {
      // A primitive element without a decorator is already enforced by the parent tuple type, and defining it
      // trips a SurrealDB bug that initialises an absent optional tuple as `{}`.
      fields.push(
        fieldModel(
          elementPath,
          wrapElement(mapToSurrealType(element.type), !!element.isOptional, element.isNullable),
          element,
        ),
      );
    }
  }
}

function topLevelField(
  field: FieldMetadata,
  model: ModelMetadata,
  context: Context,
  fields: FieldModel[],
  indexes: IndexModel[],
): void {
  if (field.isId) {
    if (!field.recordIdTypes?.length) return;
    fields.push(
      buildFieldModel({
        path: [field.name],
        kind: generateIdTypeClause(field.recordIdTypes, context.tupleRegistry, context.objectRegistry),
      }),
    );

    return;
  }
  if (field.type === 'relation') return;

  const table = model.tableName;
  const cyclic =
    field.type === 'object' &&
    !!field.objectInfo &&
    !!context.objectRegistry[field.objectInfo.objectName] &&
    objectHasCycles(field.objectInfo.objectName, context.objectRegistry);

  if (generateComputedClause(field.timestampDecorator)) {
    fields.push(fieldModel(field.name, 'datetime', {}));
  } else {
    fields.push(
      fieldModel(
        field.name,
        withoutPrefix(
          generateTypeClause(
            field.type,
            field.isRequired,
            field,
            model,
            context.tupleRegistry,
            context.literalRegistry,
          ),
          'TYPE ',
        )!,
        field,
        {
          flexible: (field.isFlexible && field.type === 'object') || cyclic,
          value: withoutPrefix(generateValueClause(field, model), 'VALUE '),
          assert: withoutPrefix(generateAssertClause(field.type, field.isArray), 'ASSERT '),
          readonly: field.isReadonly,
        },
      ),
    );
  }

  if (field.type === 'object' && field.objectInfo && !cyclic) {
    const object = context.objectRegistry[field.objectInfo.objectName];
    if (object) {
      objectSubFields(
        field.isArray ? `${field.name}.*` : field.name,
        object,
        context,
        new Set([field.objectInfo.objectName]),
        fields,
        indexes,
        table,
      );
    }
  }

  if (field.type === 'tuple' && field.tupleInfo) {
    tupleElements(
      field.isArray ? `${field.name}.*` : field.name,
      field.tupleInfo,
      context,
      new Set([`tuple:${field.tupleInfo.tupleName}`]),
      fields,
      indexes,
      table,
    );
  }
}

function buildTable(model: ModelMetadata, context: Context): TableModel {
  const fields: FieldModel[] = [];
  const subIndexes: IndexModel[] = [];
  for (const field of model.fields) topLevelField(field, model, context, fields, subIndexes);

  // Same order as the emitter: field indexes, then object sub-field indexes, then composite directives.
  const indexes: IndexModel[] = [];
  for (const field of model.fields) {
    if ((!field.isUnique && !field.isIndexed) || field.isId || field.type === 'relation') continue;
    indexes.push({
      name: `${model.tableName}_${field.name}_${field.isUnique ? 'unique' : 'index'}`,
      columns: [[field.name]],
      index: field.isUnique ? 'UNIQUE' : '',
    });
  }
  indexes.push(...subIndexes);
  for (const directive of model.compositeDirectives ?? []) {
    indexes.push({
      name: directive.name,
      columns: directive.fields.map((name) => parseFieldIdiom(name)),
      index: directive.kind === 'unique' ? 'UNIQUE' : '',
    });
  }

  return { name: model.tableName, fields, indexes };
}

/**
 * The schema the registries describe, in the model the live reader produces. Walks objects and tuples the way
 * `generateModelDefineStatements` does, including its cycle rule and the tuple-element skips, and renders types
 * through the same clause helpers so the two never describe one construct twice.
 */
export function buildDesiredSchema(
  registry: ModelRegistry,
  objectRegistry: ObjectRegistry = {},
  tupleRegistry: TupleRegistry = {},
  literalRegistry: LiteralRegistry = {},
): SchemaModel {
  const context: Context = { objectRegistry, tupleRegistry, literalRegistry };
  const tables = Object.values(registry).map((model) => buildTable(model, context));

  return { tables, unmanaged: [] };
}
