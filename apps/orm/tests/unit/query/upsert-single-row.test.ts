/**
 * Unit tests: upsert writes at most one row, the first its where matches, however the where is built, and
 * refuses an undefined unique key (top-level or a part of an object @unique key) before any query.
 */

import { describe, expect, test } from 'bun:test';
import type { Surreal } from 'surrealdb';
import { compileUpsert, QueryBuilder } from '../../../src/query/builder';
import { parseModelRegistry } from '../../test-helpers';
import { field } from './helpers';

const registry = parseModelRegistry(`
object Prof {
  handle String? @unique
  bio String?
}

model Note {
  id Record @id
  acctId Record?
  acct Relation? @field(acctId) @model(Acct)
}

model Acct {
  id Record @id
  name String
  nick String? @nullable @unique
  nickNn String? @nullable @unique(nullsNotDistinct)
  prof Prof?
  mark Int?
  notes Relation[] @model(Note)
  @@unique(slot, [name, mark])
}
`);
const acct = registry.Acct!;
// astToRegistry does not carry @nullable over
for (const name of ['nick', 'nickNn']) acct.fields.find((f) => f.name === name)!.isNullable = true;
// astToRegistry does not fill objectInfo, so the object field is described by hand
acct.fields.find((f) => f.name === 'prof')!.objectInfo = {
  objectName: 'Prof',
  fields: [
    field({ name: 'handle', type: 'string', isRequired: false, isUnique: true }),
    field({ name: 'bio', type: 'string', isRequired: false }),
  ],
};

const upsert = (where: Record<string, unknown>, update: Record<string, unknown> = { mark: 1 }) =>
  compileUpsert(acct, { where, create: { name: 'n' }, update } as never, registry);

const text = (where: Record<string, unknown>, update?: Record<string, unknown>) =>
  upsert(where, update).query.text as string;

describe('upsert is single-row', () => {
  test.each([
    ['a null on a nullable unique key', { nick: null, name: 'shared' }],
    ['a null on a nullsNotDistinct unique key', { nickNn: null }],
    ['an object-unique key beside a plain filter', { prof: { handle: 'h', bio: 'x' }, name: 'shared' }],
    ['non-unique keys only', { name: 'shared' }],
    ['a unique field beside non-unique keys', { nick: 'k', name: 'shared' }],
    ['a composite unique key', { slot: { name: 'shared', mark: 1 } }],
  ])('%s: the id read is limited to one and the write targets it', (_label, where) => {
    const sql = text(where);

    expect(sql).toMatch(/LET \$bulk_ids_n_\d+ = \(SELECT VALUE id FROM acct WHERE .* LIMIT 1\);/);
    expect(sql).not.toContain('UPSERT');
    expect(sql).toMatch(/UPDATE (ONLY )?\$bulk_ids_n_\d+(\[0\])? SET /);
  });

  test('a non-unique where updates through the id list, a unique one through its first id', () => {
    expect(text({ name: 'shared' })).toMatch(/UPDATE \$bulk_ids_n_\d+ SET /);
    expect(text({ nick: null })).toMatch(/UPDATE ONLY \$bulk_ids_n_\d+\[0\] SET /);
  });

  test('a snapshot for return before reads the first match only', () => {
    const sql = compileUpsert(
      acct,
      {
        where: { name: 'shared' },
        create: { name: 'n' },
        update: { mark: 1 },
        return: 'before',
        select: { name: true },
      },
      registry,
    ).query.text as string;

    expect(sql).toMatch(/LET \$before = \(SELECT name FROM acct WHERE .* LIMIT 1\);/);
  });

  test('relation operations: the update half writes the first match, in the direct and the array path', () => {
    const update = { mark: 1, notes: { connect: ['note:m1'] } };
    const sql = text({ nick: null, name: 'shared' }, update);

    expect(sql).toMatch(/LET \$bulk_ids_n_\d+ = \(SELECT VALUE id FROM acct WHERE .* LIMIT 1\);/);
    expect(sql).toMatch(/LET \$up_exists = \(SELECT id FROM acct WHERE .* LIMIT 1\)\[0\];/);
  });
});

describe('upsert refuses an undefined unique key before any query', () => {
  const fakeDb = {
    query: () => {
      throw new Error('a query ran');
    },
  } as unknown as Surreal;
  const builder = new QueryBuilder<Record<string, unknown>>(fakeDb, acct, registry);

  const cases: [string, Record<string, unknown>, string][] = [
    ['a top-level unique key', { nick: undefined, name: 'shared' }, 'where.nick is undefined'],
    [
      'a part of an object unique key',
      { prof: { handle: undefined, bio: 'x' }, name: 'shared' },
      "unique key 'prof.handle' has no value",
    ],
  ];

  for (const [label, where, message] of cases) {
    for (const update of [{ mark: 1 }, { mark: 1, notes: { connect: ['note:m1'] } }]) {
      const withRelationOp = 'notes' in update ? ' with a relation op' : '';

      test(`compileUpsert refuses ${label}${withRelationOp}`, () => {
        expect(() => upsert(where, update)).toThrow(message);
      });

      test(`QueryBuilder.upsert refuses ${label}${withRelationOp}`, async () => {
        await expect(builder.upsert({ where, create: { name: 'n' }, update } as never)).rejects.toThrow(message);
      });
    }
  }

  test('a defined part of the object key and a null on a nullable unique key are accepted', () => {
    expect(() => upsert({ prof: { handle: 'h', bio: 'x' }, name: 'shared' })).not.toThrow();
    expect(() => upsert({ nick: null, name: 'shared' })).not.toThrow();
    expect(() => upsert({ nickNn: null })).not.toThrow();
  });
});
