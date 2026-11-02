import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateSingleSchema } from '../../../src/cli/generate';
import { generateModelMigrationMap } from '../../../src/generators/migrations/define-generator';
import { buildDesiredSchema, parseFieldIdiom } from '../../../src/migrations';
import type { FieldPath, SchemaModel } from '../../../src/migrations';
import { toSnakeCase } from '../../../src/utils/string-utils';
import type {
  FieldMetadata,
  LiteralRegistry,
  ModelMetadata,
  ModelRegistry,
  ObjectRegistry,
  TupleRegistry,
} from '../../../src/types';
import { loadCorpus, SCHEMAS_DIR } from '../../generators/parity-corpus';

const field = (name: string, type: FieldMetadata['type'], extra: Partial<FieldMetadata> = {}): FieldMetadata => ({
  name,
  type,
  isId: false,
  isUnique: false,
  isIndexed: false,
  isRequired: true,
  ...extra,
});

const idField = field('id', 'record', { isId: true });

const model = (name: string, fields: FieldMetadata[], extra: Partial<ModelMetadata> = {}): ModelMetadata => ({
  name,
  tableName: toSnakeCase(name),
  fields: [idField, ...fields],
  ...extra,
});

const registryOf = (...models: ModelMetadata[]): ModelRegistry => Object.fromEntries(models.map((m) => [m.name, m]));

const pathKey = (path: FieldPath): string => path.map((s) => (typeof s === 'string' ? s : '*')).join('\u0000');

function find(schema: SchemaModel, table: string, ...path: string[]) {
  const key = pathKey(path);

  return schema.tables.find((t) => t.name === table)?.fields.find((f) => pathKey(f.path) === key);
}

describe('buildDesiredSchema fixtures', () => {
  test('a plain model: scalar types, optional and nullable, default, readonly', () => {
    const schema = buildDesiredSchema(
      registryOf(
        model('Person', [
          field('name', 'string'),
          field('nick', 'string', { isRequired: false }),
          field('age', 'int', { isNullable: true }),
          field('role', 'string', { defaultValue: 'user', isReadonly: true }),
          field('createdAt', 'date', { timestampDecorator: 'createdAt' }),
          field('touched', 'date', { timestampDecorator: 'updatedAt' }),
        ]),
      ),
      {},
      {},
      {},
    );

    expect(find(schema, 'person', 'name')).toEqual({ path: ['name'], kind: 'string' });
    expect(find(schema, 'person', 'nick')?.kind).toBe('none | string');
    expect(find(schema, 'person', 'age')?.kind).toBe('int | null');
    expect(find(schema, 'person', 'role')).toMatchObject({ default: "'user'", readonly: true });
    expect(find(schema, 'person', 'createdAt')).toMatchObject({ default: 'time::now()' });
    expect(find(schema, 'person', 'createdAt')?.defaultAlways).toBeUndefined();
    expect(find(schema, 'person', 'touched')).toMatchObject({ default: 'time::now()', defaultAlways: true });
  });

  test('a typed @id carries its record id type; an untyped one contributes no field', () => {
    const typed = buildDesiredSchema(
      registryOf({
        name: 'Typed',
        tableName: 'typed',
        fields: [field('id', 'record', { isId: true, recordIdTypes: ['string', 'int'] })],
      }),
      {},
      {},
      {},
    );
    expect(find(typed, 'typed', 'id')?.kind).toBe('int | string');
    expect(find(buildDesiredSchema(registryOf(model('Bare', [])), {}, {}, {}), 'bare', 'id')).toBeUndefined();
  });

  test('an object field defines its sub-fields; an array of objects goes through the element step', () => {
    const objects: ObjectRegistry = {
      Address: {
        name: 'Address',
        fields: [field('city', 'string', { isIndexed: true }), field('zip', 'string', { isRequired: false })],
      },
    };
    const info = { objectName: 'Address', fields: objects.Address!.fields };
    const schema = buildDesiredSchema(
      registryOf(
        model('Home', [
          field('address', 'object', { objectInfo: info, isFlexible: true }),
          field('past', 'object', { objectInfo: info, isArray: true }),
        ]),
      ),
      objects,
      {},
      {},
    );

    expect(find(schema, 'home', 'address')).toMatchObject({ kind: 'object', flexible: true });
    expect(find(schema, 'home', 'address', 'zip')?.kind).toBe('none | string');
    expect(find(schema, 'home', 'past')?.kind).toBe('array<object>');
    expect(find(schema, 'home', 'past', '*', 'city')?.kind).toBe('string');
    const indexes = schema.tables[0]!.indexes;
    expect(indexes.map((i) => i.name)).toEqual(['home_address_city_index', 'home_past_city_index']);
    expect(indexes[1]!.columns).toEqual([parseFieldIdiom('past.*.city')]);
  });

  test('a self-referencing object is flexible and defines no sub-fields', () => {
    const fields: FieldMetadata[] = [];
    const node = { objectName: 'Node', fields };
    fields.push(field('child', 'object', { isRequired: false, objectInfo: node }));
    const objects: ObjectRegistry = { Node: { name: 'Node', fields } };
    const schema = buildDesiredSchema(
      registryOf(model('Tree', [field('root', 'object', { objectInfo: node })])),
      objects,
      {},
      {},
    );

    expect(find(schema, 'tree', 'root')).toMatchObject({ kind: 'object', flexible: true });
    expect(schema.tables[0]!.fields.map((f) => f.path.length)).toEqual([1]);
  });

  test('a tuple defines only decorated elements, and an array tuple goes through the element step', () => {
    const tuples: TupleRegistry = {};
    const info = {
      tupleName: 'Pair',
      elements: [
        { index: 0, type: 'float' as const, isOptional: false },
        { index: 1, type: 'float' as const, isOptional: false, defaultValue: 1.5 },
      ],
    };
    const schema = buildDesiredSchema(
      registryOf(
        model('Spot', [
          field('pos', 'tuple', { tupleInfo: info }),
          field('trail', 'tuple', { tupleInfo: info, isArray: true }),
        ]),
      ),
      {},
      tuples,
      {},
    );

    expect(find(schema, 'spot', 'pos')?.kind).toBe('[float, float]');
    expect(find(schema, 'spot', 'pos[0]')).toBeUndefined();
    expect(find(schema, 'spot', 'pos[1]')).toMatchObject({ kind: 'float', default: '1.5' });
    expect(find(schema, 'spot', 'trail')?.kind).toBe('array<[float, float]>');
    expect(find(schema, 'spot', 'trail', '*[1]')).toMatchObject({ default: '1.5' });
  });

  test('a literal, an enum and a @set render their types', () => {
    const literalInfo = {
      literalName: 'Status',
      variants: [
        { kind: 'string' as const, value: 'on' },
        { kind: 'int' as const, value: 2 },
      ],
    };
    const literals: LiteralRegistry = {};
    const schema = buildDesiredSchema(
      registryOf(
        model('Switch', [
          field('state', 'literal', { literalInfo }),
          field('states', 'literal', { literalInfo: { ...literalInfo, isEnum: true }, isArray: true, isSet: true }),
          field('tags', 'string', { isArray: true, isSet: true }),
        ]),
      ),
      {},
      {},
      literals,
    );

    expect(find(schema, 'switch', 'state')?.kind).toBe("'on' | 2");
    expect(find(schema, 'switch', 'states')?.kind).toBe("set<'on' | 2>");
    expect(find(schema, 'switch', 'tags')?.kind).toBe('set<string>');
    expect(find(schema, 'switch', 'tags')?.value).toBeUndefined();
  });

  test('a @distinct @sort array carries a VALUE; a @now field is a datetime with no default', () => {
    const schema = buildDesiredSchema(
      registryOf(
        model('Bag', [
          field('xs', 'int', { isArray: true, isDistinct: true, sortOrder: 'desc' }),
          field('stamp', 'date', { timestampDecorator: 'now' }),
        ]),
      ),
      {},
      {},
      {},
    );

    expect(find(schema, 'bag', 'xs')?.value).toBe('IF $value THEN $value.distinct().sort(false) ELSE [] END');
    expect(find(schema, 'bag', 'stamp')).toEqual({ path: ['stamp'], kind: 'datetime', computed: 'time::now()' });
  });

  test('relation fields produce no field and no index; unique, indexed and composite indexes are named', () => {
    const schema = buildDesiredSchema(
      registryOf(
        model(
          'Post',
          [
            field('slug', 'string', { isUnique: true }),
            field('title', 'string', { isIndexed: true }),
            field('author', 'relation', { isUnique: true, isIndexed: true }),
          ],
          { compositeDirectives: [{ kind: 'unique', name: 'post_slug_title', fields: ['slug', 'title'] }] },
        ),
      ),
      {},
      {},
      {},
    );
    const [table] = schema.tables;

    expect(table!.fields.map((f) => f.path[0])).toEqual(['slug', 'title']);
    expect(table!.indexes).toEqual([
      { name: 'post_slug_unique', columns: [['slug']], index: 'UNIQUE' },
      { name: 'post_title_index', columns: [['title']], index: '' },
      { name: 'post_slug_title', columns: [['slug'], ['title']], index: 'UNIQUE' },
    ]);
    expect(schema.unmanaged).toEqual([]);
  });
});

describe('buildDesiredSchema over the corpus', () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'cerial-desired-'));
  afterAll(() => rmSync(outputDir, { recursive: true, force: true }));

  async function generated() {
    const { log, info, warn, error } = console;
    console.log = console.info = console.warn = console.error = () => {};
    try {
      const result = await generateSingleSchema({ schemaPath: SCHEMAS_DIR, outputDir, logLevel: 'minimal' });
      if (!result.success) throw new Error(`corpus generation failed: ${result.errors.join('; ')}`);
    } finally {
      Object.assign(console, { log, info, warn, error });
    }
    const registries = (await import(join(outputDir, 'internal', 'model-registry.ts'))) as {
      modelRegistry: ModelRegistry;
      objectRegistry?: ObjectRegistry;
      tupleRegistry?: TupleRegistry;
      literalRegistry?: LiteralRegistry;
    };

    return {
      models: registries.modelRegistry,
      objects: registries.objectRegistry ?? {},
      tuples: registries.tupleRegistry ?? {},
      literals: registries.literalRegistry ?? {},
    };
  }

  test('(table, field) and (table, index) match what the emitter writes, model by model', async () => {
    const { models, objects, tuples, literals } = await generated();
    expect(Object.keys(models).length).toBeGreaterThan(0);

    const map = generateModelMigrationMap(models, undefined, undefined, objects, tuples, literals);
    const schema = buildDesiredSchema(models, objects, tuples, literals);
    expect(schema.tables.length).toBe(Object.keys(models).length);

    let fieldCount = 0;
    let indexCount = 0;
    for (const [modelName, statements] of Object.entries(map)) {
      const table = models[modelName]!.tableName;
      const emittedFields: string[] = [];
      const emittedIndexes: string[] = [];
      for (const statement of statements) {
        const match = /^DEFINE (FIELD|INDEX)(?: OVERWRITE)? (\S+) ON TABLE (\S+)/.exec(statement);
        if (!match) continue;
        expect(match[3]).toBe(table);
        if (match[1] === 'FIELD') emittedFields.push(pathKey(parseFieldIdiom(match[2]!)));
        else emittedIndexes.push(`${match[2]}|${statement.includes(' UNIQUE') ? 'UNIQUE' : ''}`);
      }

      const built = schema.tables.find((t) => t.name === table)!;
      expect(built).toBeDefined();
      expect(built.fields.map((f) => pathKey(f.path)).sort()).toEqual(emittedFields.sort());
      expect(built.indexes.map((i) => `${i.name}|${i.index}`).sort()).toEqual(emittedIndexes.sort());
      fieldCount += emittedFields.length;
      indexCount += emittedIndexes.length;
    }

    expect(fieldCount).toBeGreaterThan(0);
    expect(indexCount).toBeGreaterThan(0);
  });

  test('abstract models contribute no table', async () => {
    const { models, objects, tuples, literals } = await generated();
    const abstractTables = loadCorpus()
      .ast.models.filter((m) => m.abstract)
      .map((m) => toSnakeCase(m.name));
    expect(abstractTables.length).toBeGreaterThan(0);

    const names = new Set(buildDesiredSchema(models, objects, tuples, literals).tables.map((t) => t.name));
    for (const name of abstractTables) expect(names.has(name)).toBe(false);
  });
});
