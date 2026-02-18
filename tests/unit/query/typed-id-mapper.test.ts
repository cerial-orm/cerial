import { describe, expect, test } from 'bun:test';
import { RecordId, Uuid } from 'surrealdb';
import { mapFieldValue, mapRecord, transformRecordIdToCerialId } from '../../../src/query/mappers/result-mapper';
import type { FieldMetadata, ModelMetadata } from '../../../src/types';
import { CerialId } from '../../../src/utils/cerial-id';

function createField(overrides: Partial<FieldMetadata> & { name: string; type: FieldMetadata['type'] }): FieldMetadata {
  return {
    isId: false,
    isUnique: false,
    isRequired: true,
    ...overrides,
  };
}

function createModel(fields: FieldMetadata[], tableName = 'test'): ModelMetadata {
  return { name: tableName.charAt(0).toUpperCase() + tableName.slice(1), tableName, fields } as ModelMetadata;
}

describe('transformRecordIdToCerialId', () => {
  test('number id: RecordId("user", 42) → CerialId with .id === 42', () => {
    const rid = new RecordId('user', 42);
    const cid = transformRecordIdToCerialId(rid);

    expect(cid).toBeInstanceOf(CerialId);
    expect(cid.table).toBe('user');
    expect(cid.id).toBe(42);
    expect(typeof cid.id).toBe('number');
  });

  test('string id: RecordId("user", "abc") → CerialId with .id === "abc"', () => {
    const rid = new RecordId('user', 'abc');
    const cid = transformRecordIdToCerialId(rid);

    expect(cid).toBeInstanceOf(CerialId);
    expect(cid.table).toBe('user');
    expect(cid.id).toBe('abc');
    expect(typeof cid.id).toBe('string');
  });

  test('array id: RecordId("loc", [1.5, 2.5]) → CerialId with array .id', () => {
    const rid = new RecordId('loc', [1.5, 2.5]);
    const cid = transformRecordIdToCerialId(rid);

    expect(cid).toBeInstanceOf(CerialId);
    expect(cid.table).toBe('loc');
    expect(Array.isArray(cid.id)).toBe(true);
    expect(cid.id).toEqual([1.5, 2.5]);
  });

  test('object id: RecordId("metric", { service: "api", ts: 123 }) → CerialId with object .id', () => {
    const rid = new RecordId('metric', { service: 'api', ts: 123 });
    const cid = transformRecordIdToCerialId(rid);

    expect(cid).toBeInstanceOf(CerialId);
    expect(cid.table).toBe('metric');
    expect(typeof cid.id).toBe('object');
    expect(cid.id).toEqual({ service: 'api', ts: 123 });
  });

  test('Uuid id: RecordId("user", Uuid) → CerialId with Uuid .id', () => {
    const uuid = new Uuid('550e8400-e29b-41d4-a716-446655440000');
    const rid = new RecordId('user', uuid);
    const cid = transformRecordIdToCerialId(rid);

    expect(cid).toBeInstanceOf(CerialId);
    expect(cid.table).toBe('user');
    expect(cid.id).toBe(uuid);
  });

  test('zero id: RecordId("user", 0) → CerialId with .id === 0 (falsy preserved)', () => {
    const rid = new RecordId('user', 0);
    const cid = transformRecordIdToCerialId(rid);

    expect(cid.id).toBe(0);
    expect(typeof cid.id).toBe('number');
  });

  test('negative number id: RecordId("user", -42) → CerialId with .id === -42', () => {
    const rid = new RecordId('user', -42);
    const cid = transformRecordIdToCerialId(rid);

    expect(cid.id).toBe(-42);
    expect(typeof cid.id).toBe('number');
  });

  test('float id: RecordId("user", 3.14) → CerialId with .id === 3.14', () => {
    const rid = new RecordId('user', 3.14);
    const cid = transformRecordIdToCerialId(rid);

    expect(cid.id).toBe(3.14);
    expect(typeof cid.id).toBe('number');
  });

  test('empty array id: RecordId("user", []) → CerialId with empty array', () => {
    const rid = new RecordId('user', []);
    const cid = transformRecordIdToCerialId(rid);

    expect(Array.isArray(cid.id)).toBe(true);
    expect(cid.id).toEqual([]);
  });

  test('empty object id: RecordId("user", {}) → CerialId with empty object', () => {
    const rid = new RecordId('user', {});
    const cid = transformRecordIdToCerialId(rid);

    expect(typeof cid.id).toBe('object');
    expect(cid.id).toEqual({});
  });

  test('nested array id: RecordId("user", ["London", 42]) → CerialId with mixed array', () => {
    const rid = new RecordId('user', ['London', 42]);
    const cid = transformRecordIdToCerialId(rid);

    expect(Array.isArray(cid.id)).toBe(true);
    expect(cid.id).toEqual(['London', 42]);
  });

  test('bigint id: RecordId("user", 9007199254740993n) → CerialId with bigint .id', () => {
    const rid = new RecordId('user', 9007199254740993n);
    const cid = transformRecordIdToCerialId(rid);

    expect(cid.id).toBe(9007199254740993n);
    expect(typeof cid.id).toBe('bigint');
  });
});

describe('mapFieldValue for record type', () => {
  test('RecordId with number id → CerialId with number .id', () => {
    const rid = new RecordId('user', 42);
    const result = mapFieldValue(rid, 'record');

    expect(result).toBeInstanceOf(CerialId);
    expect(result!.id).toBe(42);
    expect(result!.table).toBe('user');
  });

  test('RecordId with array id → CerialId with array .id', () => {
    const rid = new RecordId('user', [1, 2]);
    const result = mapFieldValue(rid, 'record');

    expect(result).toBeInstanceOf(CerialId);
    expect(result!.id).toEqual([1, 2]);
  });

  test('RecordId with object id → CerialId with object .id', () => {
    const rid = new RecordId('user', { key: 'val' });
    const result = mapFieldValue(rid, 'record');

    expect(result).toBeInstanceOf(CerialId);
    expect(result!.id).toEqual({ key: 'val' });
  });

  test('RecordId with string id → CerialId with string .id', () => {
    const rid = new RecordId('user', 'abc');
    const result = mapFieldValue(rid, 'record');

    expect(result).toBeInstanceOf(CerialId);
    expect(result!.id).toBe('abc');
  });

  test('RecordId with Uuid id → CerialId with Uuid .id', () => {
    const uuid = new Uuid('550e8400-e29b-41d4-a716-446655440000');
    const rid = new RecordId('user', uuid);
    const result = mapFieldValue(rid, 'record');

    expect(result).toBeInstanceOf(CerialId);
    expect(result!.id).toBe(uuid);
  });

  test('string value → CerialId from string (backward compat)', () => {
    const result = mapFieldValue('user:abc', 'record');

    expect(result).toBeInstanceOf(CerialId);
    expect(result!.table).toBe('user');
    expect(result!.id).toBe('abc');
  });

  test('null → null', () => {
    const result = mapFieldValue(null, 'record');

    expect(result).toBeNull();
  });

  test('undefined → undefined', () => {
    const result = mapFieldValue(undefined, 'record');

    expect(result).toBeUndefined();
  });

  test('RecordId with zero id → CerialId with .id === 0', () => {
    const rid = new RecordId('user', 0);
    const result = mapFieldValue(rid, 'record');

    expect(result).toBeInstanceOf(CerialId);
    expect(result!.id).toBe(0);
  });
});

describe('mapRecord with typed @id field', () => {
  const model = createModel([createField({ name: 'name', type: 'string', isRequired: true })], 'user');

  test('RecordId with number id → result.id is CerialId with .id === 42', () => {
    const record = { id: new RecordId('user', 42), name: 'Alice' };
    const result = mapRecord(record, model);

    expect(result.id).toBeInstanceOf(CerialId);
    expect((result.id as CerialId).id).toBe(42);
    expect((result.id as CerialId).table).toBe('user');
    expect(result.name).toBe('Alice');
  });

  test('RecordId with string id → result.id is CerialId with .id === "abc"', () => {
    const record = { id: new RecordId('user', 'abc'), name: 'Bob' };
    const result = mapRecord(record, model);

    expect(result.id).toBeInstanceOf(CerialId);
    expect((result.id as CerialId).id).toBe('abc');
  });

  test('RecordId with array id → result.id is CerialId with array .id', () => {
    const record = { id: new RecordId('user', [1, 2]), name: 'Charlie' };
    const result = mapRecord(record, model);

    expect(result.id).toBeInstanceOf(CerialId);
    expect((result.id as CerialId).id).toEqual([1, 2]);
  });

  test('RecordId with object id → result.id is CerialId with object .id', () => {
    const record = { id: new RecordId('user', { region: 'eu', seq: 7 }), name: 'Dana' };
    const result = mapRecord(record, model);

    expect(result.id).toBeInstanceOf(CerialId);
    expect((result.id as CerialId).id).toEqual({ region: 'eu', seq: 7 });
  });

  test('RecordId with Uuid id → result.id is CerialId with Uuid .id', () => {
    const uuid = new Uuid('550e8400-e29b-41d4-a716-446655440000');
    const record = { id: new RecordId('user', uuid), name: 'Eve' };
    const result = mapRecord(record, model);

    expect(result.id).toBeInstanceOf(CerialId);
    expect((result.id as CerialId).id).toBe(uuid);
  });

  test('string id fallback → result.id is CerialId from string', () => {
    const record = { id: 'user:xyz', name: 'Frank' };
    const result = mapRecord(record, model);

    expect(result.id).toBeInstanceOf(CerialId);
    expect((result.id as CerialId).table).toBe('user');
    expect((result.id as CerialId).id).toBe('xyz');
  });
});

describe('mapRecord with FK Record field', () => {
  const model = createModel(
    [
      createField({ name: 'title', type: 'string', isRequired: true }),
      createField({ name: 'authorId', type: 'record', isRequired: true }),
    ],
    'post',
  );

  test('FK RecordId with number id → CerialId with .id === 42', () => {
    const record = {
      id: new RecordId('post', 'p1'),
      title: 'Hello',
      authorId: new RecordId('user', 42),
    };
    const result = mapRecord(record, model);

    expect(result.authorId).toBeInstanceOf(CerialId);
    expect((result.authorId as CerialId).table).toBe('user');
    expect((result.authorId as CerialId).id).toBe(42);
  });

  test('FK RecordId with array id → CerialId with array .id', () => {
    const record = {
      id: new RecordId('post', 'p2'),
      title: 'World',
      authorId: new RecordId('user', ['org1', 99]),
    };
    const result = mapRecord(record, model);

    expect(result.authorId).toBeInstanceOf(CerialId);
    expect((result.authorId as CerialId).id).toEqual(['org1', 99]);
  });

  test('FK RecordId with object id → CerialId with object .id', () => {
    const record = {
      id: new RecordId('post', 'p3'),
      title: 'Test',
      authorId: new RecordId('user', { dept: 'eng', emp: 5 }),
    };
    const result = mapRecord(record, model);

    expect(result.authorId).toBeInstanceOf(CerialId);
    expect((result.authorId as CerialId).id).toEqual({ dept: 'eng', emp: 5 });
  });

  test('FK RecordId with Uuid id → CerialId with Uuid .id', () => {
    const uuid = new Uuid('11111111-2222-3333-4444-555555555555');
    const record = {
      id: new RecordId('post', 'p4'),
      title: 'Uuid FK',
      authorId: new RecordId('user', uuid),
    };
    const result = mapRecord(record, model);

    expect(result.authorId).toBeInstanceOf(CerialId);
    expect((result.authorId as CerialId).id).toBe(uuid);
  });

  test('null FK field → null preserved', () => {
    const modelWithOptionalFK = createModel(
      [
        createField({ name: 'title', type: 'string', isRequired: true }),
        createField({ name: 'authorId', type: 'record', isRequired: false, isNullable: true }),
      ],
      'post',
    );

    const record = {
      id: new RecordId('post', 'p5'),
      title: 'No Author',
      authorId: null,
    };
    const result = mapRecord(record, modelWithOptionalFK);

    expect(result.authorId).toBeNull();
  });
});

describe('mapRecord with included relations', () => {
  const model = createModel(
    [
      createField({ name: 'name', type: 'string', isRequired: true }),
      createField({
        name: 'posts',
        type: 'relation',
        isRequired: false,
        isArray: true,
        relationInfo: {
          targetModel: 'Post',
          targetTable: 'post',
          isReverse: true,
        },
      }),
    ],
    'user',
  );

  test('included array relation with number IDs', () => {
    const record = {
      id: new RecordId('user', 1),
      name: 'Alice',
      posts: [
        { id: new RecordId('post', 10), title: 'First' },
        { id: new RecordId('post', 20), title: 'Second' },
      ],
    };
    const result = mapRecord(record, model);

    const posts = result.posts as Record<string, unknown>[];
    expect(posts).toHaveLength(2);
    expect(posts[0]!.id).toBeInstanceOf(CerialId);
    expect((posts[0]!.id as CerialId).id).toBe(10);
    expect((posts[0]!.id as CerialId).table).toBe('post');
    expect(posts[1]!.id).toBeInstanceOf(CerialId);
    expect((posts[1]!.id as CerialId).id).toBe(20);
  });

  test('included relation with object IDs', () => {
    const record = {
      id: new RecordId('user', 'u1'),
      name: 'Bob',
      posts: [{ id: new RecordId('post', { year: 2025, seq: 1 }), title: 'Post A' }],
    };
    const result = mapRecord(record, model);

    const posts = result.posts as Record<string, unknown>[];
    expect(posts).toHaveLength(1);
    expect((posts[0]!.id as CerialId).id).toEqual({ year: 2025, seq: 1 });
  });

  test('included relation with Uuid IDs', () => {
    const uuid = new Uuid('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    const record = {
      id: new RecordId('user', 'u2'),
      name: 'Carol',
      posts: [{ id: new RecordId('post', uuid), title: 'Uuid Post' }],
    };
    const result = mapRecord(record, model);

    const posts = result.posts as Record<string, unknown>[];
    expect((posts[0]!.id as CerialId).id).toBe(uuid);
  });

  test('included relation with FK RecordId fields inside nested records', () => {
    const record = {
      id: new RecordId('user', 1),
      name: 'Dave',
      posts: [
        {
          id: new RecordId('post', 100),
          title: 'With FK',
          authorId: new RecordId('user', 1),
        },
      ],
    };
    const result = mapRecord(record, model);

    const posts = result.posts as Record<string, unknown>[];
    expect(posts[0]!.authorId).toBeInstanceOf(CerialId);
    expect((posts[0]!.authorId as CerialId).id).toBe(1);
    expect((posts[0]!.authorId as CerialId).table).toBe('user');
  });

  test('singular included relation (non-array) with typed ID', () => {
    const singularModel = createModel(
      [
        createField({ name: 'title', type: 'string', isRequired: true }),
        createField({
          name: 'author',
          type: 'relation',
          isRequired: false,
          isArray: false,
          relationInfo: {
            targetModel: 'User',
            targetTable: 'user',
            fieldRef: 'authorId',
            isReverse: false,
          },
        }),
      ],
      'post',
    );

    const record = {
      id: new RecordId('post', 'p1'),
      title: 'My Post',
      author: { id: new RecordId('user', 42), name: 'Alice' },
    };
    const result = mapRecord(record, singularModel);

    const author = result.author as Record<string, unknown>;
    expect(author.id).toBeInstanceOf(CerialId);
    expect((author.id as CerialId).id).toBe(42);
  });
});

describe('mapRecord with array Record field', () => {
  const model = createModel([createField({ name: 'tagIds', type: 'record', isRequired: true, isArray: true })], 'post');

  test('array of RecordIds with number ids', () => {
    const record = {
      id: new RecordId('post', 'p1'),
      tagIds: [new RecordId('tag', 1), new RecordId('tag', 2), new RecordId('tag', 3)],
    };
    const result = mapRecord(record, model);

    const tagIds = result.tagIds as CerialId[];
    expect(tagIds).toHaveLength(3);
    expect(tagIds[0]).toBeInstanceOf(CerialId);
    expect(tagIds[0]!.id).toBe(1);
    expect(tagIds[1]!.id).toBe(2);
    expect(tagIds[2]!.id).toBe(3);
  });

  test('array of RecordIds with mixed typed ids', () => {
    const record = {
      id: new RecordId('post', 'p2'),
      tagIds: [new RecordId('tag', 'abc'), new RecordId('tag', 42), new RecordId('tag', [1, 2])],
    };
    const result = mapRecord(record, model);

    const tagIds = result.tagIds as CerialId[];
    expect(tagIds[0]!.id).toBe('abc');
    expect(tagIds[1]!.id).toBe(42);
    expect(tagIds[2]!.id).toEqual([1, 2]);
  });
});

describe('mapRecord with object containing Record field', () => {
  const model = createModel(
    [
      createField({
        name: 'metadata',
        type: 'object',
        isRequired: true,
        objectInfo: {
          objectName: 'Metadata',
          fields: [
            createField({ name: 'creatorId', type: 'record', isRequired: true }),
            createField({ name: 'label', type: 'string', isRequired: true }),
          ],
        },
      }),
    ],
    'item',
  );

  test('object with RecordId field (number id) → CerialId in mapped object', () => {
    const record = {
      id: new RecordId('item', 'i1'),
      metadata: {
        creatorId: new RecordId('user', 99),
        label: 'test',
      },
    };
    const result = mapRecord(record, model);

    const meta = result.metadata as Record<string, unknown>;
    expect(meta.creatorId).toBeInstanceOf(CerialId);
    expect((meta.creatorId as CerialId).id).toBe(99);
    expect((meta.creatorId as CerialId).table).toBe('user');
    expect(meta.label).toBe('test');
  });

  test('object with RecordId field (array id) → CerialId with array .id', () => {
    const record = {
      id: new RecordId('item', 'i2'),
      metadata: {
        creatorId: new RecordId('user', ['team', 5]),
        label: 'array-id',
      },
    };
    const result = mapRecord(record, model);

    const meta = result.metadata as Record<string, unknown>;
    expect((meta.creatorId as CerialId).id).toEqual(['team', 5]);
  });
});

describe('mapRecord optional Record field handling', () => {
  test('absent nullable Record field → null', () => {
    const model = createModel(
      [createField({ name: 'parentId', type: 'record', isRequired: false, isNullable: true })],
      'node',
    );

    const record = { id: new RecordId('node', 'n1') };
    const result = mapRecord(record, model);

    expect(result.parentId).toBeNull();
  });

  test('absent non-nullable optional Record field → stays absent (undefined)', () => {
    const model = createModel([createField({ name: 'parentId', type: 'record', isRequired: false })], 'node');

    const record = { id: new RecordId('node', 'n1') };
    const result = mapRecord(record, model);

    expect('parentId' in result).toBe(false);
  });
});

describe('edge cases', () => {
  test('RecordId with deeply nested object id', () => {
    const rid = new RecordId('user', { a: { b: { c: 1 } } });
    const cid = transformRecordIdToCerialId(rid);

    expect(cid.id).toEqual({ a: { b: { c: 1 } } });
  });

  test('RecordId with array of arrays id', () => {
    const rid = new RecordId('user', [
      [1, 2],
      [3, 4],
    ]);
    const cid = transformRecordIdToCerialId(rid);

    expect(cid.id).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  test('RecordId with large number id', () => {
    const rid = new RecordId('user', 999999999);
    const cid = transformRecordIdToCerialId(rid);

    expect(cid.id).toBe(999999999);
  });

  test('mapFieldValue passthrough for non-RecordId non-string values', () => {
    // If something unexpected shows up for 'record' type, it passes through
    // Annotate as unknown — overload narrows to CerialId but runtime passes through non-RecordId values
    const result: unknown = mapFieldValue(42, 'record');

    expect(result).toBe(42);
  });

  test('multiple Record fields in same model all map correctly', () => {
    const model = createModel(
      [
        createField({ name: 'ownerId', type: 'record', isRequired: true }),
        createField({ name: 'creatorId', type: 'record', isRequired: true }),
        createField({ name: 'reviewerId', type: 'record', isRequired: false, isNullable: true }),
      ],
      'task',
    );

    const record = {
      id: new RecordId('task', 't1'),
      ownerId: new RecordId('user', 10),
      creatorId: new RecordId('user', [1, 2]),
      reviewerId: new RecordId('user', { dept: 'qa' }),
    };
    const result = mapRecord(record, model);

    expect((result.ownerId as CerialId).id).toBe(10);
    expect((result.creatorId as CerialId).id).toEqual([1, 2]);
    expect((result.reviewerId as CerialId).id).toEqual({ dept: 'qa' });
  });

  test('field not in schema but is RecordId → processNestedValue converts it', () => {
    const model = createModel([], 'test');
    const record = {
      id: new RecordId('test', 't1'),
      unknownRef: new RecordId('other', 77),
    };
    const result = mapRecord(record, model);

    expect(result.unknownRef).toBeInstanceOf(CerialId);
    expect((result.unknownRef as CerialId).id).toBe(77);
  });
});
