import { describe, expect, test } from 'bun:test';
import { sql } from 'cerial';
import { setup } from './helpers';

/**
 * Cerial only ever sends plain ints and floats, so a Number or Any field holds a sized value only
 * after a raw write (or a write by another client). Over cbor.2 the SDK hands such a value back as
 * a SizedNumber; the field must read as a number, not as null or as a raw SDK object.
 */
describe('E2E sized values written raw into Number and Any fields', () => {
  const { getClient } = setup();
  const holder = () => getClient().db.SzRawHolder;
  const raw = (statement: ReturnType<typeof sql>) => getClient().$raw(statement);

  test('a Number field written with a u16 reads as that number', async () => {
    await raw(sql`CREATE sz_raw_holder:a SET numVal = 300u16, anyVal = 1`);
    const row = (await holder().findOne({ where: { id: 'a' } }))!;

    expect(row.numVal).toBe(300);
    expect(typeof row.numVal).toBe('number');
  });

  test.each([
    ['i8', sql`CREATE sz_raw_holder:k SET numVal = -5i8, anyVal = 1`, -5],
    ['u8', sql`CREATE sz_raw_holder:k SET numVal = 200u8, anyVal = 1`, 200],
    ['i16', sql`CREATE sz_raw_holder:k SET numVal = -300i16, anyVal = 1`, -300],
    ['u16', sql`CREATE sz_raw_holder:k SET numVal = 60000u16, anyVal = 1`, 60000],
    ['i32', sql`CREATE sz_raw_holder:k SET numVal = -70000i32, anyVal = 1`, -70000],
    ['u32', sql`CREATE sz_raw_holder:k SET numVal = 4000000000u32, anyVal = 1`, 4000000000],
    ['u64', sql`CREATE sz_raw_holder:k SET numVal = 12345u64, anyVal = 1`, 12345],
    ['f16', sql`CREATE sz_raw_holder:k SET numVal = 1.5f16, anyVal = 1`, 1.5],
    ['f32', sql`CREATE sz_raw_holder:k SET numVal = 2.5f32, anyVal = 1`, 2.5],
  ])('a Number field written with %s reads as a number', async (_kind, statement, expected) => {
    await raw(statement);
    const row = (await holder().findOne({ where: { id: 'k' } }))!;

    expect(row.numVal).toBe(expected);
  });

  test('an Any field holds the number for every kind, and a u64 as a bigint', async () => {
    await raw(sql`CREATE sz_raw_holder:b SET numVal = 1, anyVal = 7u8`);
    await raw(sql`CREATE sz_raw_holder:c SET numVal = 1, anyVal = 1.5f32`);
    await raw(sql`CREATE sz_raw_holder:d SET numVal = 1, anyVal = 18446744073709551615u64`);

    expect((await holder().findOne({ where: { id: 'b' } }))!.anyVal).toBe(7);
    expect((await holder().findOne({ where: { id: 'c' } }))!.anyVal).toBe(1.5);
    const big = (await holder().findOne({ where: { id: 'd' } }))!.anyVal;

    // CerialAny does not type bigint, but the mapper unwraps a U64 to one
    expect(typeof big).toBe('bigint');
    expect(String(big)).toBe('18446744073709551615');
  });

  test('an Any field unwraps sized values inside arrays and objects, at any depth', async () => {
    await raw(sql`CREATE sz_raw_holder:e SET numVal = 1, anyVal = { list: [1u8, 2u16, { deep: 3i32 }], plain: 'x' }`);
    const row = (await holder().findOne({ where: { id: 'e' } }))!;

    expect(row.anyVal).toEqual({ list: [1, 2, { deep: 3 }], plain: 'x' });
  });

  test('findMany and a select map the same way', async () => {
    await raw(sql`CREATE sz_raw_holder:f SET numVal = 9u8, anyVal = [1u8, 2u8]`);

    expect(await holder().findMany({ select: { numVal: true, anyVal: true } })).toEqual([
      { numVal: 9, anyVal: [1, 2] },
    ]);
  });

  test('a value Cerial wrote itself still reads as before', async () => {
    const row = await holder().create({ data: { numVal: 2.5, anyVal: { a: 1 } } });

    expect(row.numVal).toBe(2.5);
    expect(row.anyVal).toEqual({ a: 1 });
  });

  test('the result carries no SDK sized-number object', async () => {
    await raw(sql`CREATE sz_raw_holder:g SET numVal = 4u8, anyVal = 4u8`);
    const row = (await holder().findOne({ where: { id: 'g' } }))!;

    expect(row.numVal).not.toBeInstanceOf(Object);
    expect(typeof row.anyVal).toBe('number');
  });
});
