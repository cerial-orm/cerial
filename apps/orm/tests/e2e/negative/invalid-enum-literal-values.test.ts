/**
 * E2E Tests: enum and literal values outside the permitted set
 *
 * Rejected by Cerial before any query is sent, with the permitted values in the message.
 *
 * Schemas: enums.cerial, literals.cerial
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const ROLE_MESSAGE = "must be one of: 'ADMIN', 'USER', 'MODERATOR'";

describe('Invalid enum and literal values — negative cases', () => {
  let client: CerialClient;
  const allTables = [...tables.enums, ...tables.literals];

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, allTables);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, allTables);
  });

  test('create throws on an unknown enum value and lists the permitted values', () => {
    expect(() => {
      client.db.EnumBasic.create({
        // @ts-expect-error — 'ADMN' is not a Role, testing runtime guard
        data: { name: 'A', role: 'ADMN', roles: [] },
      });
    }).toThrow(`Invalid data: role ${ROLE_MESSAGE} (received 'ADMN')`);
  });

  test('create is case sensitive', () => {
    expect(() => {
      client.db.EnumBasic.create({
        // @ts-expect-error — enum values are case sensitive
        data: { name: 'A', role: 'admin', roles: [] },
      });
    }).toThrow(`role ${ROLE_MESSAGE} (received 'admin')`);
  });

  test('create names the index of a bad element in an enum array', () => {
    expect(() => {
      client.db.EnumBasic.create({
        // @ts-expect-error — 'NOPE' is not a Role
        data: { name: 'A', role: 'USER', roles: ['ADMIN', 'NOPE'] },
      });
    }).toThrow(`roles[1] ${ROLE_MESSAGE} (received 'NOPE')`);
  });

  test('update throws on an unknown enum value', async () => {
    const created = await client.db.EnumBasic.create({ data: { name: 'A', role: 'USER', roles: [] } });

    expect(() => {
      client.db.EnumBasic.updateUnique({
        where: { id: created.id },
        // @ts-expect-error — 'ROOT' is not a Role
        data: { role: 'ROOT' },
      });
    }).toThrow(`Invalid data: role ${ROLE_MESSAGE} (received 'ROOT')`);

    const after = await client.db.EnumBasic.findUnique({ where: { id: created.id } });
    expect(after?.role).toBe('USER');
  });

  test('updateMany throws on an unknown enum array element', async () => {
    await client.db.EnumBasic.create({ data: { name: 'A', role: 'USER', roles: ['ADMIN'] } });

    expect(() => {
      client.db.EnumBasic.updateMany({
        where: { name: 'A' },
        // @ts-expect-error — 'NOPE' is not a Role
        data: { roles: ['ADMIN', 'NOPE'] },
      });
    }).toThrow(`roles[1] ${ROLE_MESSAGE}`);
  });

  test('a valid enum value still round-trips on create and update', async () => {
    const created = await client.db.EnumBasic.create({
      data: { name: 'A', role: 'MODERATOR', roles: ['ADMIN', 'USER'] },
    });
    expect(created.role).toBe('MODERATOR');
    expect(created.roles).toEqual(['ADMIN', 'USER']);

    const updated = await client.db.EnumBasic.updateUnique({ where: { id: created.id }, data: { role: 'ADMIN' } });
    expect(updated?.role).toBe('ADMIN');
  });

  test('create throws on an unknown literal string and an out-of-range number', () => {
    expect(() => {
      client.db.LiteralBasic.create({
        // @ts-expect-error — 'actve' is not a Status
        data: { name: 'A', status: 'actve', priority: 1, mixed: 'low', statuses: [] },
      });
    }).toThrow("status must be one of: 'active', 'inactive', 'pending' (received 'actve')");

    expect(() => {
      client.db.LiteralBasic.create({
        // @ts-expect-error — 99 is not a Priority
        data: { name: 'A', status: 'active', priority: 99, mixed: 'low', statuses: [] },
      });
    }).toThrow('priority must be one of: 1, 2, 3 (received 99)');
  });

  test('a mixed literal lists exact values and rejects others', () => {
    expect(() => {
      client.db.LiteralBasic.create({
        // @ts-expect-error — 'medium' is not in Mixed
        data: { name: 'A', status: 'active', priority: 1, mixed: 'medium', statuses: [] },
      });
    }).toThrow("mixed must be one of: 'low', 'high', 1, 2, true (received 'medium')");
  });

  test('a broad literal accepts either type and rejects a boolean', async () => {
    const a = await client.db.LiteralBroad.create({ data: { payload: 'text', values: [] } });
    const b = await client.db.LiteralBroad.create({ data: { payload: 5, values: [1, 'x'] } });
    expect(a.payload).toBe('text');
    expect(b.values).toEqual([1, 'x']);

    expect(() => {
      client.db.LiteralBroad.create({
        // @ts-expect-error — booleans are neither String nor Int
        data: { payload: true, values: [] },
      });
    }).toThrow('payload must be one of: String, Int (received true)');
  });

  test('a numeric literal accepts an equal float and rejects others', async () => {
    const created = await client.db.LiteralNumeric.create({ data: { rank: 3.0 } });
    expect(created.rank).toBe(3);

    expect(() => {
      client.db.LiteralNumeric.create({
        // @ts-expect-error — 9 is not in NumericOnly
        data: { rank: 9 },
      });
    }).toThrow('rank must be one of: 1, 2, 3, 4, 5 (received 9)');
  });

  test('an enum-backed literal reference accepts enum and extra values and rejects others', async () => {
    const a = await client.db.EnumLiteralRef.create({ data: { visibility: 'custom' } });
    const b = await client.db.EnumLiteralRef.create({ data: { visibility: 'ADMIN' } });
    expect(a.visibility).toBe('custom');
    expect(b.visibility).toBe('ADMIN');

    expect(() => {
      client.db.EnumLiteralRef.create({
        // @ts-expect-error — 'guest' is neither a Role nor 'custom'
        data: { visibility: 'guest' },
      });
    }).toThrow("visibility must be one of: 'ADMIN', 'USER', 'MODERATOR', 'custom' (received 'guest')");
  });
});
