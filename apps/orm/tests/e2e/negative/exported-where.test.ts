/**
 * E2E Tests: composing a statement from the exported where helpers cannot widen it to every row
 *
 * `transformWhereClause` used to return empty text for a key that names no field, so
 * `DELETE FROM t ${text}` deleted the whole table. The helpers now throw before any text exists, and the
 * victim rows survive the composed statement.
 *
 * Schema: placeholder-names (PnOwner)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { buildConditions, transformWhere, transformWhereClause } from '../../../src';
import { fragmentToQuery } from '../../../src/query/compile/fragment';
import type { CompiledQuery } from '../../../src/query/compile/types';
import type { WhereClause } from '../../../src/types';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import { CerialValidationError } from '../../../src/errors';
import { modelRegistry } from '../generated/internal/model-registry';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const BODIES = [
  '{"nmae":"a"}',
  '{"__proto__":{"title":"a"}}',
  '{"title ":"a"}',
  '{"constructor":"a"}',
  '{"$raw":"true"}',
  '{"AND":[{"nmae":"t1"}]}',
  '{"OR":[{"x":1}]}',
  '{"NOT":{"x":1}}',
  '{"title":{"eqq":"a"}}',
  '{"items":{"some":{"nmae":"x"}}}',
  '{"items":{"nmae":"x"}}',
  // valid keys that compile to no conditions: composed into a DELETE they would match every row
  '{"AND":[]}',
  '{"AND":[{}]}',
  '{"OR":[{}]}',
  '{"items":{}}',
  '{"NOT":{"items":{"some":{"ttle":"x"}}}}',
];

const FLEX_BODIES = [
  '{"strictAddress":{"cty":"NYC"}}',
  '{"strictAddress":{"city":"NYC","zzz":1}}',
  '{"AND":[{"strictAddress":{"cty":"NYC"}}]}',
  '{"address":{}}',
  '{"strictAddress":{}}',
  '{"profile":{}}',
  '{"AND":[{"address":{}}]}',
];

describe('Exported where helpers — negative cases', () => {
  let client: CerialClient;
  const owner = () => client.db.PnOwner.getMetadata();

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.placeholderNames);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.placeholderNames);
    await client.db.PnOwner.create({ data: { title: 'a', inc_title: 'pub' } });
    await client.db.PnOwner.create({ data: { title: 'b', inc_title: 'priv' } });
  });

  const composers: Record<string, (where: WhereClause) => CompiledQuery> = {
    transformWhere: (where) => transformWhere(where, owner(), modelRegistry),
    transformWhereClause: (where) => transformWhereClause(where, owner(), modelRegistry),
    buildConditions: (where) => fragmentToQuery(buildConditions(createCompileContext(), where, owner(), modelRegistry)),
  };

  // What an app does: compose the statement from the helper's text and run it. A refusal means no statement.
  const deleteWith = async (compose: () => CompiledQuery) => {
    try {
      const { text, vars } = compose();
      await client.query(`DELETE FROM ${owner().tableName} ${text}`, vars);
    } catch {
      // refused by the helper, or by the database
    }
  };

  test('positive: a valid where deletes only its row', async () => {
    await deleteWith(() => transformWhereClause({ title: 'a' }, owner()));

    expect((await client.db.PnOwner.findMany()).map((r) => r.title)).toEqual(['b']);
  });

  for (const [name, compose] of Object.entries(composers)) {
    for (const body of BODIES) {
      test(`negative: ${name} refuses ${body} and the victim rows survive`, async () => {
        expect(() => compose(JSON.parse(body))).toThrow();

        await deleteWith(() => compose(JSON.parse(body)));

        expect(await client.db.PnOwner.count()).toBe(2);
      });
    }
  }
});

describe('Exported where helpers — relation filters need a registry', () => {
  let client: CerialClient;
  const owner = () => client.db.PnOwner.getMetadata();

  // Relation names of this schema: items (reverse), tags0 (forward, optional), tags (array FK)
  const RELATION_BODIES = [
    '{"items":{"isNone":true}}',
    '{"title":"a","items":{"isNone":true}}',
    '{"NOT":{"items":{"some":{"title":"x"}}}}',
    '{"NOT":{"items":{"some":{"ttle":"x"}}}}',
    '{"NOT":{"items":{"some":{}}}}',
    '{"NOT":{"items":{"none":{}}}}',
    '{"NOT":{"items":{"title":"x"}}}',
    '{"NOT":{"items":{"isEmpty":true}}}',
    '{"OR":[{"items":{"some":{"title":"x"}}}]}',
    '{"tags0":{"isNone":true}}',
    '{"NOT":{"tags0":{"label":"x"}}}',
    '{"NOT":{"tags":{"some":{"label":"x"}}}}',
  ];

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.placeholderNames);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.placeholderNames);
    const a = await client.db.PnOwner.create({ data: { title: 'a', inc_title: 'pub' } });
    await client.db.PnOwner.create({ data: { title: 'b', inc_title: 'priv' } });
    await client.db.PnItem.create({ data: { title: 'x', ownerId: a.id } });
  });

  const deleteWith = async (compose: () => CompiledQuery) => {
    try {
      const { text, vars } = compose();
      // transformWhere and buildConditions give the bare conditions, transformWhereClause the WHERE keyword too
      const clause = !text || text.startsWith('WHERE') ? text : `WHERE ${text}`;
      await client.query(`DELETE FROM ${owner().tableName} ${clause}`, vars);
    } catch {
      // refused by the helper, or by the database
    }
  };

  const composers: Record<string, (where: WhereClause, reg?: typeof modelRegistry) => CompiledQuery> = {
    transformWhere: (where, reg) => transformWhere(where, owner(), reg),
    transformWhereClause: (where, reg) => transformWhereClause(where, owner(), reg),
    buildConditions: (where, reg) => fragmentToQuery(buildConditions(createCompileContext(), where, owner(), reg)),
  };

  for (const [name, compose] of Object.entries(composers)) {
    for (const body of RELATION_BODIES) {
      test(`negative: ${name} without a registry refuses ${body} and the victim rows survive`, async () => {
        expect(() => compose(JSON.parse(body))).toThrow(CerialValidationError);

        await deleteWith(() => compose(JSON.parse(body)));

        expect(await client.db.PnOwner.count()).toBe(2);
      });
    }

    test(`positive: ${name} with a registry deletes exactly the owners without items`, async () => {
      await deleteWith(() => compose({ NOT: { items: { some: { title: 'x' } } } } as WhereClause, modelRegistry));

      expect((await client.db.PnOwner.findMany()).map((r) => r.title)).toEqual(['a']);
    });

    test(`positive: ${name} with a registry deletes exactly the owners with a matching item`, async () => {
      await deleteWith(() => compose({ items: { some: { title: 'x' } } } as WhereClause, modelRegistry));

      expect((await client.db.PnOwner.findMany()).map((r) => r.title)).toEqual(['b']);
    });

    test(`positive: ${name} without a registry still deletes by a plain field`, async () => {
      await deleteWith(() => compose({ title: 'a' }));

      expect((await client.db.PnOwner.findMany()).map((r) => r.title)).toEqual(['b']);
    });
  }
});

describe('Exported where helpers — object sub-keys', () => {
  let client: CerialClient;
  const flexUser = () => client.db.FlexUser.getMetadata();
  const address = { street: '1 Main', city: 'NYC' };

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.flexible);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.flexible);
    for (const [name, priority] of [
      ['Alice', 'high'],
      ['Bob', 'low'],
    ] as const) {
      await client.db.FlexUser.create({
        data: {
          name,
          address: { ...address, priority },
          tags: [{ ...address, label: 'home' }],
          profile: { bio: 'hi', metadata: { label: 'x', score: 5 } },
          strictAddress: address,
        },
      });
    }
  });

  const deleteWith = async (where: WhereClause) => {
    try {
      const { text, vars } = transformWhereClause(where, flexUser(), modelRegistry);
      await client.query(`DELETE FROM ${flexUser().tableName} ${text}`, vars);
    } catch {
      // refused by the helper, or by the database
    }
  };

  test('positive: a flexible object sub-key is accepted and deletes exactly the matching row', async () => {
    await deleteWith({ address: { priority: 'high' } } as WhereClause);

    expect((await client.db.FlexUser.findMany()).map((r) => r.name)).toEqual(['Bob']);
  });

  for (const body of FLEX_BODIES) {
    test(`negative: refuses ${body} and the victim rows survive`, async () => {
      expect(() => transformWhereClause(JSON.parse(body), flexUser(), modelRegistry)).toThrow();

      await deleteWith(JSON.parse(body));

      expect(await client.db.FlexUser.count()).toBe(2);
    });
  }
});
