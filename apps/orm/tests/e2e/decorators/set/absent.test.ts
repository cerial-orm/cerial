import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

const SET_TABLES = tables.set;

/** isEmpty never matches or errors on an absent array; isNone selects the absent ones. */
describe('E2E Set: isEmpty and isNone on absent arrays', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, SET_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, SET_TABLES);

    const strictBag = { tags: [], nums: [] };
    await client.db.SetNested.create({ data: { name: 'absent', strictBag } });
    await client.db.SetNested.create({ data: { name: 'empty', bag: { tags: [], nums: [] }, strictBag } });
    await client.db.SetNested.create({ data: { name: 'full', bag: { tags: ['a', 'b'], nums: [1, 2] }, strictBag } });
  });

  const names = async (
    where: Parameters<CerialClient['db']['SetNested']['findMany']>[0] extends infer A
      ? A extends { where?: infer W }
        ? W
        : never
      : never,
  ): Promise<string[]> => {
    const rows = await client.db.SetNested.findMany({ where, orderBy: { name: 'asc' } });

    return rows.map((r) => r.name);
  };

  for (const field of ['tags', 'nums'] as const) {
    describe(`bag.${field}`, () => {
      test('isEmpty: true matches a present empty array only', async () => {
        expect(await names({ bag: { [field]: { isEmpty: true } } })).toEqual(['empty']);
      });

      test('isEmpty: false matches a present non-empty array only', async () => {
        expect(await names({ bag: { [field]: { isEmpty: false } } })).toEqual(['full']);
      });

      test('isNone: true matches the absent field only', async () => {
        expect(await names({ bag: { [field]: { isNone: true } } })).toEqual(['absent']);
      });

      test('isNone: false matches every present field', async () => {
        expect(await names({ bag: { [field]: { isNone: false } } })).toEqual(['empty', 'full']);
      });

      test('OR of isEmpty: true and isNone: true matches empty and absent', async () => {
        expect(
          await names({ OR: [{ bag: { [field]: { isEmpty: true } } }, { bag: { [field]: { isNone: true } } }] }),
        ).toEqual(['absent', 'empty']);
      });

      test('NOT isEmpty: true keeps the absent record', async () => {
        expect(await names({ NOT: { bag: { [field]: { isEmpty: true } } } })).toEqual(['absent', 'full']);
      });
    });
  }

  describe('strictBag, always present', () => {
    test('isEmpty: true matches every record, isEmpty: false none', async () => {
      expect(await names({ strictBag: { tags: { isEmpty: true } } })).toEqual(['absent', 'empty', 'full']);
      expect(await names({ strictBag: { tags: { isEmpty: false } } })).toEqual([]);
    });
  });

  test('isEmpty combined with has on the same field', async () => {
    expect(await names({ bag: { tags: { isEmpty: false, has: 'a' } } })).toEqual(['full']);
    expect(await names({ bag: { tags: { isEmpty: true, has: 'a' } } })).toEqual([]);
  });
});
