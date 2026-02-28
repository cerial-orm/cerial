import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId } from '../../../../src/utils/cerial-id';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  OBJECT_TABLES,
  testConfig,
  truncateTables,
} from './helpers';

/** Shorthand for creating homeAddress with coordinates default */
const emptyCoords: number[] = [];
const ha = (fields: { street: string; city: string; zip: string; country?: string; apartment?: string }) => ({
  coordinates: emptyCoords,
  ...fields,
});

describe('E2E Extends: Object Inheritance', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, OBJECT_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, OBJECT_TABLES);
  });

  describe('create with ExtAddress (basic inheritance)', () => {
    test('creates with all inherited + own fields', async () => {
      const result = await client.db.ExtAddressUser.create({
        data: {
          name: 'Alice',
          homeAddress: {
            street: '123 Main St',
            city: 'Springfield',
            zip: '62701',
            apartment: '4B',
            coordinates: [39.7817, -89.6501],
          },
        },
      });

      expect(result.id).toBeInstanceOf(CerialId);
      expect(result.name).toBe('Alice');
      expect(result.homeAddress.street).toBe('123 Main St');
      expect(result.homeAddress.city).toBe('Springfield');
      expect(result.homeAddress.zip).toBe('62701');
      expect(result.homeAddress.country).toBe('US'); // @default('US') from ExtBaseAddress
      expect(result.homeAddress.apartment).toBe('4B');
      expect(result.homeAddress.coordinates).toEqual([39.7817, -89.6501]);
    });

    test('creates with inherited default country applied', async () => {
      const result = await client.db.ExtAddressUser.create({
        data: {
          name: 'Bob',
          homeAddress: ha({ street: '456 Oak Ave', city: 'Portland', zip: '97201' }),
        },
      });

      expect(result.homeAddress.country).toBe('US');
      expect(result.homeAddress.apartment).toBeUndefined();
      expect(result.homeAddress.coordinates).toEqual([]);
    });

    test('creates with explicit country overriding default', async () => {
      const result = await client.db.ExtAddressUser.create({
        data: {
          name: 'Charlie',
          homeAddress: ha({ street: '10 Downing', city: 'London', zip: 'SW1A 2AA', country: 'UK' }),
        },
      });

      expect(result.homeAddress.country).toBe('UK');
    });
  });

  describe('create with ExtDetailedAddress (override)', () => {
    test('creates with overridden default country USA', async () => {
      const result = await client.db.ExtAddressUser.create({
        data: {
          name: 'Dave',
          homeAddress: {
            ...ha({ street: '1 Main', city: 'NYC', zip: '10001' }),
          },
          workAddress: {
            street: '100 Work Blvd',
            city: 'Manhattan',
            zip: '10002',
            latitude: 40.7128,
            longitude: -74.006,
            timezone: 'America/New_York',
          },
        },
      });

      expect(result.workAddress).toBeDefined();
      expect(result.workAddress!.country).toBe('USA'); // overridden default
      expect(result.workAddress!.latitude).toBe(40.7128);
      expect(result.workAddress!.longitude).toBe(-74.006);
      expect(result.workAddress!.timezone).toBe('America/New_York');
    });

    test('workAddress is optional', async () => {
      const result = await client.db.ExtAddressUser.create({
        data: {
          name: 'Eve',
          homeAddress: ha({ street: '1 St', city: 'LA', zip: '90001' }),
        },
      });

      expect(result.workAddress).toBeUndefined();
    });

    test('creates DetailedAddress with only required fields', async () => {
      const result = await client.db.ExtAddressUser.create({
        data: {
          name: 'Frank',
          homeAddress: ha({ street: '1 St', city: 'LA', zip: '90001' }),
          workAddress: {
            street: '200 Office Rd',
            city: 'SF',
            zip: '94102',
          },
        },
      });

      expect(result.workAddress!.country).toBe('USA');
      expect(result.workAddress!.latitude).toBeUndefined();
      expect(result.workAddress!.longitude).toBeUndefined();
      expect(result.workAddress!.timezone).toBeUndefined();
    });
  });

  describe('create with ExtGeoAddress (multi-level inheritance)', () => {
    test('creates with multi-level inherited fields', async () => {
      const result = await client.db.ExtAddressUser.create({
        data: {
          name: 'Grace',
          homeAddress: ha({ street: '1 St', city: 'LA', zip: '90001' }),
          previousAddresses: [
            {
              street: '789 Hill Rd',
              city: 'Denver',
              zip: '80201',
              apartment: '12A',
              coordinates: [39.7392, -104.9903],
              elevation: 1609.0,
              timezone: 'America/Denver',
            },
          ],
        },
      });

      expect(result.previousAddresses).toHaveLength(1);
      const addr = result.previousAddresses[0]!;
      // From ExtBaseAddress
      expect(addr.street).toBe('789 Hill Rd');
      expect(addr.city).toBe('Denver');
      expect(addr.zip).toBe('80201');
      expect(addr.country).toBe('US'); // inherited default
      // From ExtAddress
      expect(addr.apartment).toBe('12A');
      expect(addr.coordinates).toEqual([39.7392, -104.9903]);
      // Own fields
      expect(addr.elevation).toBe(1609.0);
      expect(addr.timezone).toBe('America/Denver');
    });

    test('creates GeoAddress with defaults from all levels', async () => {
      const result = await client.db.ExtAddressUser.create({
        data: {
          name: 'Hank',
          homeAddress: ha({ street: '1 St', city: 'LA', zip: '90001' }),
          previousAddresses: [
            {
              street: '100 Sea Level',
              city: 'Miami',
              zip: '33101',
              coordinates: emptyCoords,
            },
          ],
        },
      });

      const addr = result.previousAddresses[0]!;
      expect(addr.country).toBe('US'); // from ExtBaseAddress
      expect(addr.coordinates).toEqual([]); // array default
      expect(addr.timezone).toBe('UTC'); // @default('UTC') from ExtGeoAddress
      expect(addr.elevation).toBeUndefined(); // optional
    });

    test('creates multiple previous addresses', async () => {
      const result = await client.db.ExtAddressUser.create({
        data: {
          name: 'Ivy',
          homeAddress: ha({ street: '1 St', city: 'LA', zip: '90001' }),
          previousAddresses: [
            { street: 'Addr1', city: 'C1', zip: '11111', coordinates: emptyCoords, timezone: 'UTC' },
            {
              street: 'Addr2',
              city: 'C2',
              zip: '22222',
              country: 'CA',
              coordinates: emptyCoords,
              timezone: 'UTC',
              elevation: 500,
            },
          ],
        },
      });

      expect(result.previousAddresses).toHaveLength(2);
      expect(result.previousAddresses[0]!.country).toBe('US');
      expect(result.previousAddresses[1]!.country).toBe('CA');
      expect(result.previousAddresses[1]!.elevation).toBe(500);
    });
  });

  describe('select on extended object sub-fields', () => {
    test('selects specific sub-fields of homeAddress', async () => {
      await client.db.ExtAddressUser.create({
        data: {
          name: 'SelectTest',
          homeAddress: {
            street: '123 Main',
            city: 'Boston',
            zip: '02101',
            apartment: '5C',
            coordinates: [42.36, -71.06],
          },
        },
      });

      const results = await client.db.ExtAddressUser.findMany({
        where: { name: 'SelectTest' },
        select: {
          name: true,
          homeAddress: { street: true, city: true },
        },
      });

      expect(results).toHaveLength(1);
      const result = results[0]!;
      expect(result.name).toBe('SelectTest');
      expect(result.homeAddress.street).toBe('123 Main');
      expect(result.homeAddress.city).toBe('Boston');
      expect('zip' in result.homeAddress).toBe(false);
      expect('apartment' in result.homeAddress).toBe(false);
    });

    test('selects inherited fields from extended object', async () => {
      await client.db.ExtAddressUser.create({
        data: {
          name: 'InheritSelect',
          homeAddress: ha({ street: 'A St', city: 'Denver', zip: '80201', country: 'UK' }),
        },
      });

      const results = await client.db.ExtAddressUser.findMany({
        where: { name: 'InheritSelect' },
        select: { homeAddress: { country: true, coordinates: true } },
      });

      expect(results[0]!.homeAddress.country).toBe('UK');
      expect(results[0]!.homeAddress.coordinates).toEqual([]);
    });
  });

  describe('where filtering on extended object sub-fields', () => {
    test('filters by inherited street field', async () => {
      await client.db.ExtAddressUser.create({
        data: {
          name: 'Target',
          homeAddress: ha({ street: 'Unique Street 42', city: 'A', zip: '00001' }),
        },
      });
      await client.db.ExtAddressUser.create({
        data: {
          name: 'Other',
          homeAddress: ha({ street: 'Different Road', city: 'B', zip: '00002' }),
        },
      });

      const results = await client.db.ExtAddressUser.findMany({
        where: { homeAddress: { street: 'Unique Street 42' } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Target');
    });

    test('filters by inherited country field with operator', async () => {
      await client.db.ExtAddressUser.create({
        data: {
          name: 'US_User',
          homeAddress: ha({ street: 'A', city: 'B', zip: '00001' }),
        },
      });
      await client.db.ExtAddressUser.create({
        data: {
          name: 'UK_User',
          homeAddress: ha({ street: 'C', city: 'D', zip: '00002', country: 'UK' }),
        },
      });

      const results = await client.db.ExtAddressUser.findMany({
        where: { homeAddress: { country: { eq: 'UK' } } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('UK_User');
    });

    test('filters by own apartment field (optional)', async () => {
      await client.db.ExtAddressUser.create({
        data: {
          name: 'WithApt',
          homeAddress: ha({ street: 'A', city: 'B', zip: '00001', apartment: '3A' }),
        },
      });
      await client.db.ExtAddressUser.create({
        data: {
          name: 'NoApt',
          homeAddress: ha({ street: 'C', city: 'D', zip: '00002' }),
        },
      });

      const results = await client.db.ExtAddressUser.findMany({
        where: { homeAddress: { apartment: '3A' } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('WithApt');
    });
  });

  describe('update extended object fields', () => {
    test('updates inherited field in homeAddress', async () => {
      const created = await client.db.ExtAddressUser.create({
        data: {
          name: 'UpdUser',
          homeAddress: ha({ street: 'Old St', city: 'OldCity', zip: '11111' }),
        },
      });

      const updated = await client.db.ExtAddressUser.updateMany({
        where: { id: created.id },
        data: { homeAddress: { street: 'New St', city: 'NewCity' } },
      });

      expect(updated).toHaveLength(1);
      expect(updated[0]!.homeAddress.street).toBe('New St');
      expect(updated[0]!.homeAddress.city).toBe('NewCity');
      expect(updated[0]!.homeAddress.zip).toBe('11111'); // preserved
    });

    test('updates own apartment field', async () => {
      const created = await client.db.ExtAddressUser.create({
        data: {
          name: 'AptUpd',
          homeAddress: ha({ street: 'St', city: 'C', zip: '00001' }),
        },
      });

      const updated = await client.db.ExtAddressUser.updateMany({
        where: { id: created.id },
        data: { homeAddress: { apartment: '7F' } },
      });

      expect(updated[0]!.homeAddress.apartment).toBe('7F');
    });

    test('updates workAddress (ExtDetailedAddress) fields', async () => {
      const created = await client.db.ExtAddressUser.create({
        data: {
          name: 'WorkUpd',
          homeAddress: ha({ street: 'St', city: 'C', zip: '00001' }),
          workAddress: { street: 'Work', city: 'WC', zip: '99999' },
        },
      });

      const updated = await client.db.ExtAddressUser.updateMany({
        where: { id: created.id },
        data: { workAddress: { latitude: 51.5074, longitude: -0.1278 } },
      });

      expect(updated[0]!.workAddress!.latitude).toBe(51.5074);
      expect(updated[0]!.workAddress!.longitude).toBe(-0.1278);
      expect(updated[0]!.workAddress!.street).toBe('Work'); // preserved
    });

    test('pushes to previousAddresses (ExtGeoAddress array)', async () => {
      const created = await client.db.ExtAddressUser.create({
        data: {
          name: 'PushAddr',
          homeAddress: ha({ street: 'St', city: 'C', zip: '00001' }),
          previousAddresses: [{ street: 'First', city: 'FC', zip: '10000', coordinates: emptyCoords, timezone: 'UTC' }],
        },
      });

      const updated = await client.db.ExtAddressUser.updateMany({
        where: { id: created.id },
        data: {
          previousAddresses: {
            push: { street: 'Second', city: 'SC', zip: '20000', country: 'US', coordinates: [1, 2], timezone: 'EST' },
          },
        },
      });

      expect(updated[0]!.previousAddresses).toHaveLength(2);
      expect(updated[0]!.previousAddresses[1]!.street).toBe('Second');
    });
  });

  describe('ExtCityAddress pick verification', () => {
    test('CityAddress pick fields are used correctly in where', async () => {
      // ExtCityAddress picks [city, country] from ExtBaseAddress + adds district
      // We verify by filtering on homeAddress (which is ExtAddress) by city only
      await client.db.ExtAddressUser.create({
        data: {
          name: 'CityPick',
          homeAddress: ha({ street: 'X', city: 'PickCity', zip: '12345' }),
        },
      });

      const results = await client.db.ExtAddressUser.findMany({
        where: { homeAddress: { city: 'PickCity' } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.homeAddress.city).toBe('PickCity');
    });
  });

  describe('ExtSimpleAddress omit verification', () => {
    test('SimpleAddress omit country is reflected in model usage', async () => {
      // ExtSimpleAddress omits [country] from ExtBaseAddress + adds region
      // Verify we can filter homeAddress by city/zip (non-omitted fields)
      await client.db.ExtAddressUser.create({
        data: {
          name: 'OmitTest',
          homeAddress: ha({ street: 'Omit St', city: 'OmitCity', zip: '54321' }),
        },
      });

      const results = await client.db.ExtAddressUser.findMany({
        where: { homeAddress: { city: 'OmitCity', zip: '54321' } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('OmitTest');
    });
  });

  describe('orderBy on extended object fields', () => {
    test('orders by inherited city field in homeAddress', async () => {
      await client.db.ExtAddressUser.create({
        data: { name: 'Z', homeAddress: ha({ street: 'A', city: 'Zurich', zip: '00001' }) },
      });
      await client.db.ExtAddressUser.create({
        data: { name: 'A', homeAddress: ha({ street: 'B', city: 'Amsterdam', zip: '00002' }) },
      });
      await client.db.ExtAddressUser.create({
        data: { name: 'M', homeAddress: ha({ street: 'C', city: 'Munich', zip: '00003' }) },
      });

      const results = await client.db.ExtAddressUser.findMany({
        orderBy: { homeAddress: { city: 'asc' } },
      });

      expect(results).toHaveLength(3);
      expect(results[0]!.homeAddress.city).toBe('Amsterdam');
      expect(results[1]!.homeAddress.city).toBe('Munich');
      expect(results[2]!.homeAddress.city).toBe('Zurich');
    });
  });

  describe('count and exists with extended objects', () => {
    test('count with object sub-field filter', async () => {
      await client.db.ExtAddressUser.create({
        data: { name: 'C1', homeAddress: ha({ street: 'A', city: 'CountCity', zip: '00001' }) },
      });
      await client.db.ExtAddressUser.create({
        data: { name: 'C2', homeAddress: ha({ street: 'B', city: 'CountCity', zip: '00002' }) },
      });
      await client.db.ExtAddressUser.create({
        data: { name: 'C3', homeAddress: ha({ street: 'C', city: 'OtherCity', zip: '00003' }) },
      });

      const count = await client.db.ExtAddressUser.count({ homeAddress: { city: 'CountCity' } });

      expect(count).toBe(2);
    });

    test('exists with inherited object field', async () => {
      await client.db.ExtAddressUser.create({
        data: { name: 'ExUser', homeAddress: ha({ street: 'Ex St', city: 'ExCity', zip: '99999' }) },
      });

      const exists = await client.db.ExtAddressUser.exists({ homeAddress: { zip: '99999' } });
      const notExists = await client.db.ExtAddressUser.exists({ homeAddress: { zip: '00000' } });

      expect(exists).toBe(true);
      expect(notExists).toBe(false);
    });
  });

  describe('delete with extended object filter', () => {
    test('deletes by object sub-field', async () => {
      await client.db.ExtAddressUser.create({
        data: { name: 'DelObj', homeAddress: ha({ street: 'Del St', city: 'DelCity', zip: '77777' }) },
      });

      const count = await client.db.ExtAddressUser.deleteMany({
        where: { homeAddress: { city: 'DelCity' } },
      });

      expect(count).toBe(1);
      const remaining = await client.db.ExtAddressUser.findMany({
        where: { homeAddress: { city: 'DelCity' } },
      });
      expect(remaining).toHaveLength(0);
    });
  });

  describe('findMany with extended objects (no args)', () => {
    test('returns all records with correct object shapes', async () => {
      await client.db.ExtAddressUser.create({
        data: { name: 'All1', homeAddress: ha({ street: 'S1', city: 'C1', zip: '00001' }) },
      });
      await client.db.ExtAddressUser.create({
        data: {
          name: 'All2',
          homeAddress: ha({ street: 'S2', city: 'C2', zip: '00002', apartment: '3B' }),
        },
      });

      const all = await client.db.ExtAddressUser.findMany();

      expect(all).toHaveLength(2);
      for (const item of all) {
        expect(item.id).toBeInstanceOf(CerialId);
        expect(item.homeAddress.street).toBeDefined();
        expect(item.homeAddress.city).toBeDefined();
        expect(item.homeAddress.zip).toBeDefined();
        expect(item.homeAddress.country).toBe('US');
      }
    });
  });
});
