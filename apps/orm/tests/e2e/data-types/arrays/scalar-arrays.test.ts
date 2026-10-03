import { describe, expect, test } from 'bun:test';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

describe('E2E Arrays: Email[] and Bool[]', () => {
  const { getClient } = setupDataTypeTests(tables.scalarArrays);

  test('stores and returns both arrays', async () => {
    const client = getClient();
    const result = await client.db.ScalarArrays.create({
      data: { emails: ['a@example.com', 'b@example.com'], flags: [true, false, true] },
    });

    expect(result.emails).toEqual(['a@example.com', 'b@example.com']);
    expect(result.flags).toEqual([true, false, true]);
  });

  test('defaults both arrays to empty when omitted', async () => {
    const client = getClient();
    const result = await client.db.ScalarArrays.create({ data: {} });

    expect(result.emails).toEqual([]);
    expect(result.flags).toEqual([]);
  });

  test('rejects an element that is not an email', async () => {
    const client = getClient();

    await expect(
      (async () => {
        await client.db.ScalarArrays.create({ data: { emails: ['a@example.com', 'not-an-email'] } });
      })(),
    ).rejects.toThrow();
    expect(await client.db.ScalarArrays.count()).toBe(0);
  });

  test('rejects a non-boolean element', async () => {
    const client = getClient();

    await expect(
      (async () => {
        // @ts-expect-error a string is not assignable to Bool[]
        await client.db.ScalarArrays.create({ data: { flags: [true, 'yes'] } });
      })(),
    ).rejects.toThrow();
  });

  test('filters with has on each array', async () => {
    const client = getClient();
    await client.db.ScalarArrays.create({ data: { emails: ['a@example.com'], flags: [true] } });
    await client.db.ScalarArrays.create({ data: { emails: ['b@example.com'], flags: [false] } });

    const byEmail = await client.db.ScalarArrays.findMany({ where: { emails: { has: 'b@example.com' } } });
    const byFlag = await client.db.ScalarArrays.findMany({ where: { flags: { has: true } } });

    expect(byEmail).toHaveLength(1);
    expect(byEmail[0]?.emails).toEqual(['b@example.com']);
    expect(byFlag).toHaveLength(1);
    expect(byFlag[0]?.flags).toEqual([true]);
  });

  test('update replaces an array and push appends', async () => {
    const client = getClient();
    const created = await client.db.ScalarArrays.create({ data: { emails: ['a@example.com'], flags: [true] } });

    await client.db.ScalarArrays.updateMany({
      where: { id: created.id },
      data: { emails: { push: 'c@example.com' }, flags: [false] },
    });
    const after = await client.db.ScalarArrays.findOne({ where: { id: created.id } });

    expect(after?.emails).toEqual(['a@example.com', 'c@example.com']);
    expect(after?.flags).toEqual([false]);
  });
});
