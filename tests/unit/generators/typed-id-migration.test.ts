import { describe, expect, test } from 'bun:test';
import {
  generateDefineField,
  generateModelDefineStatements,
} from '../../../src/generators/migrations/define-generator';
import { generateIdTypeClause } from '../../../src/generators/migrations/type-mapper';
import type { FieldMetadata, ModelMetadata, ObjectRegistry, TupleRegistry } from '../../../src/types';
import { parseModelRegistry } from '../../test-helpers';

function makeIdField(recordIdTypes?: string[]): FieldMetadata {
  return {
    name: 'id',
    type: 'record',
    isId: true,
    isUnique: true,
    isRequired: true,
    recordIdTypes,
  };
}

function makeModel(name: string, tableName: string, fields: FieldMetadata[]): ModelMetadata {
  return { name, tableName, fields };
}

// ─── generateIdTypeClause (unit) ────────────────────────────────────────────

describe('generateIdTypeClause', () => {
  test('maps int to int', () => {
    expect(generateIdTypeClause(['int'])).toBe('int');
  });

  test('maps string to string', () => {
    expect(generateIdTypeClause(['string'])).toBe('string');
  });

  test('maps number to number', () => {
    expect(generateIdTypeClause(['number'])).toBe('number');
  });

  test('maps uuid to uuid', () => {
    expect(generateIdTypeClause(['uuid'])).toBe('uuid');
  });

  test('maps union of primitives with pipe separator', () => {
    expect(generateIdTypeClause(['string', 'int'])).toBe('string | int');
  });

  test('maps triple union', () => {
    expect(generateIdTypeClause(['string', 'int', 'uuid'])).toBe('string | int | uuid');
  });

  test('resolves tuple from tupleRegistry', () => {
    const tupleRegistry: TupleRegistry = {
      Coordinate: {
        name: 'Coordinate',
        elements: [
          { index: 0, type: 'float', isOptional: false },
          { index: 1, type: 'float', isOptional: false },
        ],
      },
    };

    expect(generateIdTypeClause(['Coordinate'], tupleRegistry)).toBe('[float, float]');
  });

  test('resolves object from objectRegistry', () => {
    const objectRegistry: ObjectRegistry = {
      Point: {
        name: 'Point',
        fields: [
          { name: 'x', type: 'float', isId: false, isUnique: false, isRequired: true },
          { name: 'y', type: 'float', isId: false, isUnique: false, isRequired: true },
        ],
      },
    };

    expect(generateIdTypeClause(['Point'], undefined, objectRegistry)).toBe('{ x: float, y: float }');
  });

  test('resolves object with optional field', () => {
    const objectRegistry: ObjectRegistry = {
      IdObj: {
        name: 'IdObj',
        fields: [
          { name: 'key', type: 'string', isId: false, isUnique: false, isRequired: true },
          { name: 'version', type: 'int', isId: false, isUnique: false, isRequired: false },
        ],
      },
    };

    expect(generateIdTypeClause(['IdObj'], undefined, objectRegistry)).toBe('{ key: string, version: option<int> }');
  });

  test('resolves object with nullable field', () => {
    const objectRegistry: ObjectRegistry = {
      IdObj: {
        name: 'IdObj',
        fields: [
          { name: 'key', type: 'string', isId: false, isUnique: false, isRequired: true },
          { name: 'label', type: 'string', isId: false, isUnique: false, isRequired: true, isNullable: true },
        ],
      },
    };

    expect(generateIdTypeClause(['IdObj'], undefined, objectRegistry)).toBe('{ key: string, label: string | null }');
  });

  test('resolves mixed union of primitive and tuple', () => {
    const tupleRegistry: TupleRegistry = {
      Pair: {
        name: 'Pair',
        elements: [
          { index: 0, type: 'int', isOptional: false },
          { index: 1, type: 'int', isOptional: false },
        ],
      },
    };

    expect(generateIdTypeClause(['int', 'Pair'], tupleRegistry)).toBe('int | [int, int]');
  });

  test('resolves mixed union of primitive and object', () => {
    const objectRegistry: ObjectRegistry = {
      Slug: {
        name: 'Slug',
        fields: [{ name: 'value', type: 'string', isId: false, isUnique: false, isRequired: true }],
      },
    };

    expect(generateIdTypeClause(['int', 'Slug'], undefined, objectRegistry)).toBe('int | { value: string }');
  });

  test('passes through unknown type names as-is', () => {
    // If a type name is not a known primitive and not in registries, it's returned verbatim
    expect(generateIdTypeClause(['UnknownType'])).toBe('UnknownType');
  });

  test('resolves tuple with nested tuple elements', () => {
    const tupleRegistry: TupleRegistry = {
      Inner: {
        name: 'Inner',
        elements: [
          { index: 0, type: 'int', isOptional: false },
          { index: 1, type: 'int', isOptional: false },
        ],
      },
      Outer: {
        name: 'Outer',
        elements: [
          { index: 0, type: 'string', isOptional: false },
          {
            index: 1,
            type: 'tuple',
            isOptional: false,
            tupleInfo: {
              tupleName: 'Inner',
              elements: [
                { index: 0, type: 'int', isOptional: false },
                { index: 1, type: 'int', isOptional: false },
              ],
            },
          },
        ],
      },
    };

    expect(generateIdTypeClause(['Outer'], tupleRegistry)).toBe('[string, [int, int]]');
  });
});

// ─── generateDefineField for @id fields ─────────────────────────────────────

describe('generateDefineField for @id fields', () => {
  const model = makeModel('User', 'user', []);

  test('returns empty string for plain Record @id (no recordIdTypes)', () => {
    const field = makeIdField();
    expect(generateDefineField(field, 'user', model)).toBe('');
  });

  test('returns empty string for plain Record @id with empty recordIdTypes', () => {
    const field = makeIdField([]);
    expect(generateDefineField(field, 'user', model)).toBe('');
  });

  test('generates DEFINE FIELD OVERWRITE id for Record(int) @id', () => {
    const field = makeIdField(['int']);
    const result = generateDefineField(field, 'user', model);

    expect(result).toBe('DEFINE FIELD OVERWRITE id ON TABLE user TYPE int;');
  });

  test('generates DEFINE FIELD OVERWRITE id for Record(string) @id', () => {
    const field = makeIdField(['string']);
    const result = generateDefineField(field, 'user', model);

    expect(result).toBe('DEFINE FIELD OVERWRITE id ON TABLE user TYPE string;');
  });

  test('generates DEFINE FIELD OVERWRITE id for Record(number) @id', () => {
    const field = makeIdField(['number']);
    const result = generateDefineField(field, 'user', model);

    expect(result).toBe('DEFINE FIELD OVERWRITE id ON TABLE user TYPE number;');
  });

  test('generates DEFINE FIELD OVERWRITE id for Record(uuid) @id', () => {
    const field = makeIdField(['uuid']);
    const result = generateDefineField(field, 'user', model);

    expect(result).toBe('DEFINE FIELD OVERWRITE id ON TABLE user TYPE uuid;');
  });

  test('generates union type for Record(string, int) @id', () => {
    const field = makeIdField(['string', 'int']);
    const result = generateDefineField(field, 'user', model);

    expect(result).toBe('DEFINE FIELD OVERWRITE id ON TABLE user TYPE string | int;');
  });

  test('always uses OVERWRITE regardless of field options', () => {
    const field = makeIdField(['int']);

    // Even with overwrite: false, typed @id always uses OVERWRITE
    const result = generateDefineField(field, 'user', model, { overwrite: false });
    expect(result).toContain('DEFINE FIELD OVERWRITE');
  });

  test('always uses OVERWRITE even with ifNotExists option', () => {
    const field = makeIdField(['int']);

    const result = generateDefineField(field, 'user', model, { ifNotExists: true });
    expect(result).toContain('DEFINE FIELD OVERWRITE');
    expect(result).not.toContain('IF NOT EXISTS');
  });

  test('uses correct table name', () => {
    const field = makeIdField(['string']);
    const result = generateDefineField(field, 'my_table', model);

    expect(result).toBe('DEFINE FIELD OVERWRITE id ON TABLE my_table TYPE string;');
  });

  test('resolves tuple type from tupleRegistry', () => {
    const field = makeIdField(['Coordinate']);
    const tupleRegistry: TupleRegistry = {
      Coordinate: {
        name: 'Coordinate',
        elements: [
          { index: 0, type: 'float', isOptional: false },
          { index: 1, type: 'float', isOptional: false },
        ],
      },
    };

    const result = generateDefineField(field, 'user', model, {}, tupleRegistry);

    expect(result).toBe('DEFINE FIELD OVERWRITE id ON TABLE user TYPE [float, float];');
  });

  test('resolves object type from objectRegistry', () => {
    const field = makeIdField(['Point']);
    const objectRegistry: ObjectRegistry = {
      Point: {
        name: 'Point',
        fields: [
          { name: 'x', type: 'float', isId: false, isUnique: false, isRequired: true },
          { name: 'y', type: 'float', isId: false, isUnique: false, isRequired: true },
        ],
      },
    };

    const result = generateDefineField(field, 'user', model, {}, undefined, undefined, objectRegistry);

    expect(result).toBe('DEFINE FIELD OVERWRITE id ON TABLE user TYPE { x: float, y: float };');
  });

  test('resolves mixed union of primitive and tuple', () => {
    const field = makeIdField(['int', 'Pair']);
    const tupleRegistry: TupleRegistry = {
      Pair: {
        name: 'Pair',
        elements: [
          { index: 0, type: 'int', isOptional: false },
          { index: 1, type: 'int', isOptional: false },
        ],
      },
    };

    const result = generateDefineField(field, 'user', model, {}, tupleRegistry);

    expect(result).toBe('DEFINE FIELD OVERWRITE id ON TABLE user TYPE int | [int, int];');
  });
});

// ─── generateModelDefineStatements with typed @id ───────────────────────────

describe('generateModelDefineStatements with typed @id', () => {
  test('plain Record @id produces no DEFINE FIELD for id (DSL)', () => {
    const registry = parseModelRegistry(`
model User {
  id Record @id
  name String
}
`);
    const model = registry['User']!;
    const statements = generateModelDefineStatements(model);

    const idStmt = statements.find((s) => s.includes('DEFINE FIELD') && s.match(/ id /));
    expect(idStmt).toBeUndefined();
  });

  test('Record(int) @id produces DEFINE FIELD OVERWRITE id (DSL)', () => {
    const registry = parseModelRegistry(`
model User {
  id Record(int) @id
  name String
}
`);
    const model = registry['User']!;
    const statements = generateModelDefineStatements(model);

    const idStmt = statements.find((s) => s.includes('DEFINE FIELD') && s.match(/ id /));
    expect(idStmt).toBeDefined();
    expect(idStmt).toBe('DEFINE FIELD OVERWRITE id ON TABLE user TYPE int;');
  });

  test('Record(string) @id produces DEFINE FIELD OVERWRITE id (DSL)', () => {
    const registry = parseModelRegistry(`
model User {
  id Record(string) @id
  name String
}
`);
    const model = registry['User']!;
    const statements = generateModelDefineStatements(model);

    const idStmt = statements.find((s) => s.includes('DEFINE FIELD') && s.match(/ id /));
    expect(idStmt).toBe('DEFINE FIELD OVERWRITE id ON TABLE user TYPE string;');
  });

  test('Record(uuid) @id produces DEFINE FIELD OVERWRITE id (DSL)', () => {
    const registry = parseModelRegistry(`
model User {
  id Record(uuid) @id
  name String
}
`);
    const model = registry['User']!;
    const statements = generateModelDefineStatements(model);

    const idStmt = statements.find((s) => s.includes('DEFINE FIELD') && s.match(/ id /));
    expect(idStmt).toBe('DEFINE FIELD OVERWRITE id ON TABLE user TYPE uuid;');
  });

  test('Record(string, int) @id produces union type (DSL)', () => {
    const registry = parseModelRegistry(`
model User {
  id Record(string, int) @id
  name String
}
`);
    const model = registry['User']!;
    const statements = generateModelDefineStatements(model);

    const idStmt = statements.find((s) => s.includes('DEFINE FIELD') && s.match(/ id /));
    expect(idStmt).toBe('DEFINE FIELD OVERWRITE id ON TABLE user TYPE string | int;');
  });

  test('Record(number) @id produces number type (DSL)', () => {
    const registry = parseModelRegistry(`
model User {
  id Record(number) @id
  name String
}
`);
    const model = registry['User']!;
    const statements = generateModelDefineStatements(model);

    const idStmt = statements.find((s) => s.includes('DEFINE FIELD') && s.match(/ id /));
    expect(idStmt).toBe('DEFINE FIELD OVERWRITE id ON TABLE user TYPE number;');
  });

  test('typed @id does not affect other field definitions', () => {
    const registry = parseModelRegistry(`
model User {
  id Record(int) @id
  name String
  age Int?
}
`);
    const model = registry['User']!;
    const statements = generateModelDefineStatements(model);

    // id field should be defined
    expect(statements.some((s) => s.includes('DEFINE FIELD OVERWRITE id ON TABLE user TYPE int'))).toBe(true);

    // Other fields should still be defined normally
    expect(statements.some((s) => s.includes('DEFINE FIELD OVERWRITE name ON TABLE user TYPE string'))).toBe(true);
    expect(statements.some((s) => s.includes('DEFINE FIELD OVERWRITE age ON TABLE user TYPE option<int>'))).toBe(true);
  });

  test('non-@id Record fields are unaffected by typed @id feature', () => {
    const registry = parseModelRegistry(`
model User {
  id Record(int) @id
  authorId Record
  author Relation @field(authorId) @model(Post)
}

model Post {
  id Record @id
  title String
}
`);
    const model = registry['User']!;
    const statements = generateModelDefineStatements(model);

    // authorId should still be record<post>, not affected by typed @id
    const authorIdStmt = statements.find((s) => s.includes('authorId'));
    expect(authorIdStmt).toContain('TYPE record<post>');
  });

  test('typed @id with tuple resolution via generateModelDefineStatements', () => {
    const tupleRegistry: TupleRegistry = {
      Coordinate: {
        name: 'Coordinate',
        elements: [
          { index: 0, type: 'float', isOptional: false },
          { index: 1, type: 'float', isOptional: false },
        ],
      },
    };

    const model = makeModel('Location', 'location', [
      { name: 'id', type: 'record', isId: true, isUnique: true, isRequired: true, recordIdTypes: ['Coordinate'] },
      { name: 'label', type: 'string', isId: false, isUnique: false, isRequired: true },
    ]);

    const statements = generateModelDefineStatements(model, undefined, undefined, undefined, tupleRegistry);

    const idStmt = statements.find((s) => s.includes('DEFINE FIELD') && s.match(/ id /));
    expect(idStmt).toBe('DEFINE FIELD OVERWRITE id ON TABLE location TYPE [float, float];');
  });

  test('typed @id with object resolution via generateModelDefineStatements', () => {
    const objectRegistry: ObjectRegistry = {
      CompoundKey: {
        name: 'CompoundKey',
        fields: [
          { name: 'tenant', type: 'string', isId: false, isUnique: false, isRequired: true },
          { name: 'seq', type: 'int', isId: false, isUnique: false, isRequired: true },
        ],
      },
    };

    const model = makeModel('Invoice', 'invoice', [
      { name: 'id', type: 'record', isId: true, isUnique: true, isRequired: true, recordIdTypes: ['CompoundKey'] },
      { name: 'amount', type: 'float', isId: false, isUnique: false, isRequired: true },
    ]);

    const statements = generateModelDefineStatements(model, undefined, undefined, objectRegistry);

    const idStmt = statements.find((s) => s.includes('DEFINE FIELD') && s.match(/ id /));
    expect(idStmt).toBe('DEFINE FIELD OVERWRITE id ON TABLE invoice TYPE { tenant: string, seq: int };');
  });

  test('typed @id does NOT generate sub-field DEFINEs for tuple elements', () => {
    const tupleRegistry: TupleRegistry = {
      Coordinate: {
        name: 'Coordinate',
        elements: [
          { index: 0, type: 'float', isOptional: false },
          { index: 1, type: 'float', isOptional: false },
        ],
      },
    };

    const model = makeModel('Location', 'location', [
      { name: 'id', type: 'record', isId: true, isUnique: true, isRequired: true, recordIdTypes: ['Coordinate'] },
      { name: 'label', type: 'string', isId: false, isUnique: false, isRequired: true },
    ]);

    const statements = generateModelDefineStatements(model, undefined, undefined, undefined, tupleRegistry);

    // Should NOT have any sub-field definitions like id[0], id[1]
    const subFieldStmts = statements.filter((s) => s.includes('id['));
    expect(subFieldStmts).toHaveLength(0);
  });

  test('typed @id does NOT generate sub-field DEFINEs for object fields', () => {
    const objectRegistry: ObjectRegistry = {
      CompoundKey: {
        name: 'CompoundKey',
        fields: [
          { name: 'tenant', type: 'string', isId: false, isUnique: false, isRequired: true },
          { name: 'seq', type: 'int', isId: false, isUnique: false, isRequired: true },
        ],
      },
    };

    const model = makeModel('Invoice', 'invoice', [
      { name: 'id', type: 'record', isId: true, isUnique: true, isRequired: true, recordIdTypes: ['CompoundKey'] },
      { name: 'amount', type: 'float', isId: false, isUnique: false, isRequired: true },
    ]);

    const statements = generateModelDefineStatements(model, undefined, undefined, objectRegistry);

    // Should NOT have any sub-field definitions like id.tenant, id.seq
    const subFieldStmts = statements.filter((s) => s.includes('id.'));
    expect(subFieldStmts).toHaveLength(0);
  });

  test('statement ordering: typed @id DEFINE FIELD comes before other fields', () => {
    const model = makeModel('User', 'user', [
      { name: 'id', type: 'record', isId: true, isUnique: true, isRequired: true, recordIdTypes: ['int'] },
      { name: 'name', type: 'string', isId: false, isUnique: false, isRequired: true },
      { name: 'email', type: 'email', isId: false, isUnique: true, isRequired: true },
    ]);

    const statements = generateModelDefineStatements(model);

    // First statement is DEFINE TABLE
    expect(statements[0]).toContain('DEFINE TABLE');

    // Second statement should be the id field
    expect(statements[1]).toContain('DEFINE FIELD OVERWRITE id ON TABLE user TYPE int');

    // Then other fields
    expect(statements[2]).toContain('DEFINE FIELD OVERWRITE name');
    expect(statements[3]).toContain('DEFINE FIELD OVERWRITE email');
  });
});
