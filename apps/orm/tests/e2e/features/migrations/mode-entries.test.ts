/**
 * E2E Tests: Migrations modes - an already-migrated database keeps working under each mode.
 *
 * Schema: test-basics-isolated.cerial
 * The preload migrated the database, so 'auto', 'verify' and 'off' each find it ready and one read and one write work.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialClient, cleanupTables, tables, testConfig, truncateTables, uniqueEmail } from '../../test-helper';

type Mode = 'auto' | 'verify' | 'off';
const modes: readonly Mode[] = ['auto', 'verify', 'off'];

describe('E2E Migrations: mode entries on a migrated database', () => {
  const opened: CerialClient[] = [];
  let cleaner: CerialClient;

  beforeAll(async () => {
    cleaner = new CerialClient();
    await cleaner.connect(testConfig);
    await cleanupTables(cleaner, tables.basics);
  });

  afterAll(async () => {
    for (const client of opened) await client.disconnect();
    await cleaner.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(cleaner, tables.basics);
  });

  for (const mode of modes) {
    test(`one write and one read work under '${mode}'`, async () => {
      const client = new CerialClient({ migrations: mode });
      opened.push(client);
      await client.connect(testConfig);

      const email = uniqueEmail();
      const created = await client.db.BasicsUser.create({ data: { email, name: 'Mode User', isActive: true } });
      const found = await client.db.BasicsUser.findMany({ where: { email } });

      expect(created.email).toBe(email);
      expect(found).toHaveLength(1);
      expect(found[0]!.name).toBe('Mode User');
    });
  }
});
