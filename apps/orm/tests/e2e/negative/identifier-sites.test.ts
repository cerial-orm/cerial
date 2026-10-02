/**
 * E2E Tests: hostile identifiers at the remaining key-path sites
 *
 * hostile-keys.test.ts covers the validated surfaces. These cover the sites it
 * does not reach: the array-closure where path on strict and flexible object
 * arrays, CREATE SET on a model with an @set field, the nested-update where key
 * and sub-keys of `unset`. The victim is the `user` table that each payload
 * tries to remove.
 *
 * Schema: core (User), flexible (FlexUser), set (SetBasic), objects (ObjectTestUser),
 * relation-with-objects (RelObjCompany)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const HOSTILE = "x'; REMOVE TABLE user; --";
// Parses as a complete statement once interpolated, unlike a payload with an unbalanced quote
const HOSTILE_STATEMENT = 'city = NONE; REMOVE TABLE user; --';
const ALL_TABLES = [
  ...tables.basics,
  ...tables.flexible,
  ...tables.set,
  ...tables.objects,
  ...tables.relationWithObjects,
];

const rejects = (run: () => unknown, message: string) =>
  expect(
    (async () => {
      await run();
    })(),
  ).rejects.toThrow(message);

describe('Hostile identifiers at the remaining key-path sites', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, ALL_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, ALL_TABLES);
    await client.db.User.create({ data: { email: 'v@b.co', name: 'V', isActive: true } });
  });

  const expectVictimSurvived = async () => expect(await client.db.User.count()).toBe(1);

  test('where on a strict object array closure rejects the key and names it', async () => {
    await rejects(
      // @ts-expect-error — hostile key is not a sub-field, testing runtime guard
      () => client.db.ObjectTestUser.findMany({ where: { locations: { some: { [HOSTILE]: 1 } } } }),
      `Invalid where clause: Unknown field 'locations.${HOSTILE}' on model ObjectTestUser`,
    );

    await expectVictimSurvived();
  });

  test('where on a flexible object array closure quotes the key instead of running it', async () => {
    await client.db.FlexUser.create({
      data: {
        name: 'F',
        address: { street: 's', city: 'c' },
        tags: [{ street: 's', city: 'c' }],
        profile: { bio: 'b', metadata: { label: 'l' } },
        strictAddress: { street: 's', city: 'c' },
      },
    });

    const rows = await client.db.FlexUser.findMany({ where: { tags: { some: { [HOSTILE]: 'y' } } } });

    expect(rows).toEqual([]);
    await expectVictimSurvived();
  });

  test('create on a model with an @set field rejects a hostile key and writes nothing', async () => {
    await rejects(
      // @ts-expect-error — hostile key is not a field, testing runtime guard
      () => client.db.SetBasic.create({ data: { name: 'S', tags: ['a'], numbers: [1], uuids: [], [HOSTILE]: 'x' } }),
      `Invalid data: Unknown field '${HOSTILE}' on model SetBasic`,
    );

    expect(await client.db.SetBasic.count()).toBe(0);
    await expectVictimSurvived();
  });

  test('upsert create on a model with an @set field rejects a hostile key and writes nothing', async () => {
    await rejects(
      () =>
        client.db.SetBasic.upsert({
          where: { name: 'S' },
          // @ts-expect-error — hostile key is not a field, testing runtime guard
          create: { name: 'S', tags: ['a'], numbers: [1], uuids: [], [HOSTILE]: 'x' },
          update: { name: 'S' },
        }),
      `Unknown field '${HOSTILE}' on model SetBasic`,
    );

    expect(await client.db.SetBasic.count()).toBe(0);
    await expectVictimSurvived();
  });

  test('a nested update rejects a hostile where key before any statement is built', async () => {
    await rejects(
      () =>
        client.db.RelObjCompany.updateUnique({
          // @ts-expect-error — hostile key is not a field, testing runtime guard
          where: { [HOSTILE]: 'x' },
          data: { employees: { create: { name: 'E', homeAddress: { street: 'S', city: 'C', state: 'ST' } } } },
        }),
      `Invalid where clause: Unknown field: ${HOSTILE}`,
    );

    expect(await client.db.RelObjEmployee.count()).toBe(0);
    await expectVictimSurvived();
  });

  test('unset with a hostile sub-key does not run the key', async () => {
    const address = { street: 'S', city: 'C', zip: null };
    const row = await client.db.FlexUser.create({
      data: { name: 'F', address, profile: { bio: 'b', metadata: { label: 'l' } }, strictAddress: address },
    });

    // Whether this throws or is ignored is the open question in the band notes; the payload must not run either way.
    await client.db.FlexUser.updateUnique({
      where: { id: row.id },
      data: {},
      // @ts-expect-error — hostile key is not a sub-field, testing runtime guard
      unset: { strictAddress: { [HOSTILE_STATEMENT]: true } },
    }).catch(() => undefined);

    await expectVictimSurvived();
  });
});
