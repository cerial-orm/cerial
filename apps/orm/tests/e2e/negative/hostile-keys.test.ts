/**
 * E2E Tests: hostile identifiers as keys — negative cases
 *
 * A key carrying SurrealQL syntax must be rejected by name at every surface
 * that takes a key, so it can never reach the query text. Values are always
 * bound as parameters and are not covered here. Computed `string` keys widen
 * to an index signature, so only some surfaces need @ts-expect-error.
 *
 * Schema: core (User), flexible (FlexUser), uuid (UuidDecorated), relation-with-objects (RelObjCompany)
 * No e2e schema declares a field with an underscore, so the inverse check uses
 * the digit-bearing field autoV4.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const HOSTILE_KEYS = [
  'name; DROP TABLE basics_user; --',
  "name' OR '1'='1",
  '`name`',
  'name[0]',
  'name.id',
  '../name',
  ' ',
  '',
  'nаme', // Cyrillic 'а' (U+0430), not the Latin 'a'
  'name​', // zero-width space
];

const ALL_TABLES = [...tables.basics, ...tables.flexible, ...tables.uuid, ...tables.relationWithObjects];

const rejects = (run: () => unknown, message: string) =>
  expect(
    (async () => {
      await run();
    })(),
  ).rejects.toThrow(message);

describe('Hostile keys — negative cases', () => {
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
  });

  describe.each(HOSTILE_KEYS)('key %j', (key) => {
    const unknown = (prefix: string, path = key, model = 'BasicsUser') =>
      `${prefix}: Unknown field '${path}' on model ${model}`;

    test('create data', () =>
      rejects(
        () => client.db.BasicsUser.create({ data: { email: 'a@b.co', name: 'A', isActive: true, [key]: 'x' } }),
        unknown('Invalid data'),
      ));

    test('updateMany data', () =>
      rejects(
        // @ts-expect-error — hostile key is not a field, testing runtime guard
        () => client.db.BasicsUser.updateMany({ where: { name: 'A' }, data: { [key]: 'x' } }),
        unknown('Invalid data'),
      ));

    test('select', () =>
      rejects(
        // @ts-expect-error — hostile key is not a field, testing runtime guard
        () => client.db.BasicsUser.findMany({ select: { [key]: true } }),
        unknown('Invalid select'),
      ));

    test('orderBy', () =>
      rejects(() => client.db.BasicsUser.findMany({ orderBy: { [key]: 'asc' } }), unknown('Invalid orderBy')));

    test('include', () =>
      rejects(
        // @ts-expect-error — hostile key is not a relation, testing runtime guard
        () => client.db.BasicsUser.findMany({ include: { [key]: true } }),
        unknown('Invalid include'),
      ));

    test('where at top level', () =>
      rejects(
        () => client.db.BasicsUser.findMany({ where: { [key]: 'x' } }),
        `Invalid where clause: Unknown field '${key}' on model BasicsUser`,
      ));

    test('where object sub-key', () =>
      rejects(
        () => client.db.FlexUser.findMany({ where: { strictAddress: { [key]: 'x' } } }),
        unknown('Invalid where clause', `strictAddress.${key}`, 'FlexUser'),
      ));

    test('select object sub-key', () =>
      rejects(
        // @ts-expect-error — hostile key is not a sub-field, testing runtime guard
        () => client.db.FlexUser.findMany({ select: { strictAddress: { [key]: true } } }),
        unknown('Invalid select', `strictAddress.${key}`, 'FlexUser'),
      ));

    test('orderBy object sub-key', () =>
      rejects(
        () => client.db.FlexUser.findMany({ orderBy: { strictAddress: { [key]: 'asc' } } }),
        unknown('Invalid orderBy', `strictAddress.${key}`, 'FlexUser'),
      ));
  });

  test('a hostile key writes nothing', async () => {
    await rejects(
      () =>
        client.db.BasicsUser.create({
          // @ts-expect-error — hostile key is not a field, testing runtime guard
          data: { email: 'a@b.co', name: 'A', isActive: true, 'x; DROP TABLE basics_user': 1 },
        }),
      "Unknown field 'x; DROP TABLE basics_user'",
    );

    expect(await client.db.BasicsUser.count()).toBe(0);
  });

  test('a declared field name containing a digit works at every surface', async () => {
    const created = await client.db.UuidDecorated.create({ data: { name: 'U' }, select: { autoV4: true } });
    expect(created.autoV4).toBeDefined();

    const rows = await client.db.UuidDecorated.findMany({
      where: { autoV4: created.autoV4! },
      select: { name: true, autoV4: true },
      orderBy: { autoV4: 'asc' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.autoV4!.toString()).toBe(created.autoV4!.toString());
  });

  describe('strict-object sub-keys in update data', () => {
    const ADDRESS = { street: 'S', city: 'C', zip: null };
    const HOSTILE = "x'; REMOVE TABLE user; --";
    const TYPO = 'cty';

    const seedFlexUser = () =>
      client.db.FlexUser.create({
        data: {
          name: 'F',
          address: ADDRESS,
          profile: { bio: 'b', metadata: { label: 'l' } },
          strictAddress: ADDRESS,
        },
      });

    /** The victim is the `user` table that the hostile payload tries to remove. */
    const seedVictim = () => client.db.BasicsUser.create({ data: { email: 'v@b.co', name: 'V', isActive: true } });

    const expectVictimSurvived = async () => expect(await client.db.BasicsUser.count()).toBe(1);

    const unknown = (path: string) => `Unknown field '${path}' on model FlexUser`;

    describe.each([
      ['a typo', TYPO],
      ['a hostile key', HOSTILE],
    ])('%s', (_label, key) => {
      beforeEach(async () => {
        await seedVictim();
      });

      test('updateMany throws, writes nothing and keeps the victim table', async () => {
        const row = await seedFlexUser();

        await rejects(
          () => client.db.FlexUser.updateMany({ where: { id: row.id }, data: { strictAddress: { [key]: 'x' } } }),
          `Invalid data: ${unknown(`strictAddress.${key}`)}`,
        );

        await expectVictimSurvived();
        expect((await client.db.FlexUser.findOne({ where: { id: row.id } }))!.strictAddress).toEqual(ADDRESS);
      });

      test('updateUnique throws, writes nothing and keeps the victim table', async () => {
        const row = await seedFlexUser();

        await rejects(
          () =>
            client.db.FlexUser.updateUnique({
              where: { id: row.id },
              data: { strictAddress: { [key]: 'x' } },
            }),
          `Invalid data: ${unknown(`strictAddress.${key}`)}`,
        );

        await expectVictimSurvived();
        expect((await client.db.FlexUser.findOne({ where: { id: row.id } }))!.strictAddress).toEqual(ADDRESS);
      });

      test('upsert throws on the update half and keeps the victim table', async () => {
        const row = await seedFlexUser();

        await rejects(
          () =>
            client.db.FlexUser.upsert({
              where: { id: row.id },
              create: {
                name: 'F',
                address: ADDRESS,
                profile: { bio: 'b', metadata: { label: 'l' } },
                strictAddress: ADDRESS,
              },
              update: { strictAddress: { [key]: 'x' } },
            }),
          `Invalid data: ${unknown(`strictAddress.${key}`)}`,
        );

        await expectVictimSurvived();
        expect((await client.db.FlexUser.findOne({ where: { id: row.id } }))!.strictAddress).toEqual(ADDRESS);
      });

      test('an update that also carries a nested relation operation throws and keeps the victim table', async () => {
        const company = await client.db.RelObjCompany.create({
          data: { name: 'Co', headquarters: { street: 'S', city: 'C', state: 'ST' } },
        });

        await rejects(
          () =>
            client.db.RelObjCompany.updateUnique({
              where: { id: company.id },
              data: {
                headquarters: { [key]: 'x' },
                employees: { create: { name: 'E', homeAddress: { street: 'S', city: 'C', state: 'ST' } } },
              },
            }),
          `Invalid data: Unknown field 'headquarters.${key}' on model RelObjCompany`,
        );

        await expectVictimSurvived();
        expect(await client.db.RelObjEmployee.count()).toBe(0);
      });
    });

    test('a typo one level down is named by its full path from the model root', async () => {
      const row = await seedFlexUser();

      await rejects(
        () =>
          client.db.FlexUser.updateUnique({
            where: { id: row.id },
            data: { profile: { bio: 'b', bogus: 'x' } },
          }),
        `Invalid data: ${unknown('profile.bogus')}`,
      );
    });

    test('the same object type is flexible on one field and strict on another', async () => {
      const row = await seedFlexUser();

      const updated = await client.db.FlexUser.updateUnique({
        where: { id: row.id },
        // address is @flexible, so an undeclared sub-key is accepted and stored
        data: { address: { extra: 'kept' } },
      });
      expect((updated!.address as Record<string, unknown>).extra).toBe('kept');

      await rejects(
        () =>
          client.db.FlexUser.updateUnique({
            where: { id: row.id },
            // @ts-expect-error — strictAddress is not @flexible, testing runtime guard
            data: { strictAddress: { extra: 'lost' } },
          }),
        `Invalid data: ${unknown('strictAddress.extra')}`,
      );
    });

    test('a hostile key on a @flexible field is quoted, not executed, and the victim table survives', async () => {
      await seedVictim();
      const row = await seedFlexUser();

      await client.db.FlexUser.updateUnique({ where: { id: row.id }, data: { address: { [HOSTILE]: 'v' } } });

      await expectVictimSurvived();
    });
  });
});
