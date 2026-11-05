/**
 * E2E Tests: the exported `build*Query` functions cannot run a second statement
 *
 * Each payload fired against the old exports (rows deleted, a table dropped, a column overwritten). They
 * now refuse before any text exists, and a payload built by hand into the query text proves nothing ran:
 * the table keeps its rows and values.
 *
 * Schema: placeholder-names (PnOwner)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  buildCreateQuery,
  buildFindManyQuery,
  buildSelectQuery,
  buildUpdateManyQuery,
  executeQuery,
  handleEq,
  sql,
} from '../../../src';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('Exported builders — negative cases', () => {
  let client: CerialClient;
  const owner = () => client.db.PnOwner.getMetadata();

  const run = async (build: () => { text: string; vars: Record<string, unknown> }) => {
    try {
      await executeQuery(client.getSurreal()!, build());
    } catch {
      // refused by the builder or by the database; the assertions below check the data
    }
  };

  const expectUntouched = async () => {
    const rows = await client.db.PnOwner.findMany({ orderBy: { title: 'asc' } });

    expect(rows.map((r) => [r.title, r.inc_title])).toEqual([
      ['a', 'pub'],
      ['b', 'priv'],
    ]);
  };

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

  test('positive: a valid findMany through the export still runs', async () => {
    const rows = await executeQuery<{ title: string }>(
      client.getSurreal()!,
      buildFindManyQuery(owner(), { orderBy: { title: 'asc' }, limit: 1 }),
    );

    expect(rows.map((r) => r.title)).toEqual(['a']);
  });

  test('negative: limit payload deletes nothing', async () => {
    expect(() => buildFindManyQuery(owner(), { limit: '1; DELETE pn_owner' as never })).toThrow();
    await run(() => buildFindManyQuery(owner(), { limit: '1; DELETE pn_owner' as never }));
    await expectUntouched();
  });

  test('negative: offset payload deletes nothing', async () => {
    expect(() => buildFindManyQuery(owner(), { offset: '0; DELETE pn_owner' as never })).toThrow();
    await run(() => buildFindManyQuery(owner(), { offset: '0; DELETE pn_owner' as never }));
    await expectUntouched();
  });

  test('negative: select key payload deletes nothing', async () => {
    const select = { 'id FROM pn_owner; DELETE pn_owner; SELECT id': true };

    expect(() => buildSelectQuery(owner(), { select })).toThrow();
    await run(() => buildSelectQuery(owner(), { select }));
    await expectUntouched();
  });

  test('negative: compute key payload deletes nothing', async () => {
    const compute = { 'c` FROM pn_owner; DELETE pn_owner; SELECT 1 AS `d': sql`1` };

    expect(() => buildSelectQuery(owner(), { compute } as never)).toThrow();
    await run(() => buildSelectQuery(owner(), { compute } as never));
    await expectUntouched();
  });

  test('negative: orderBy direction payload runs no second statement', async () => {
    const orderBy = { title: 'asc; DELETE pn_owner' } as never;

    expect(() => buildFindManyQuery(owner(), { orderBy })).toThrow();
    await run(() => buildFindManyQuery(owner(), { orderBy }));
    await expectUntouched();
  });

  test('negative: update data key overwrites no column', async () => {
    const data = { 'title = title, inc_title': 'x' };

    expect(() => buildUpdateManyQuery(owner(), { title: 'a' }, data)).toThrow();
    await run(() => buildUpdateManyQuery(owner(), { title: 'a' }, data));
    await expectUntouched();
  });

  test('negative: create data key stores nothing', async () => {
    const data = { title: 'n', inc_title: 'n', 'rev_create_posts = 1, title': 'x' };

    expect(() => buildCreateQuery(owner(), data)).toThrow();
    await run(() => buildCreateQuery(owner(), data));
    await expectUntouched();
  });

  test('negative: handleEq with a hostile field builds no text and deletes nothing', async () => {
    const field = 'title = title; DELETE pn_owner; --';
    const meta = owner().fields.find((f) => f.name === 'title')!;

    expect(() => handleEq(createCompileContext(), field, null, meta)).toThrow(/Invalid field/);
    await run(() => {
      const fragment = handleEq(createCompileContext(), field, null, meta);

      return { text: `DELETE pn_owner WHERE ${fragment.text}`, vars: fragment.vars };
    });
    await expectUntouched();
  });
});
