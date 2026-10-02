import type { CerialClient } from '../../test-helper';

/** Publishers and books for relation ordering; the names sort differently from insertion order. */
export async function seedBooks(client: CerialClient): Promise<void> {
  const cedar = await client.db.Publisher.create({ data: { id: 'p-cedar', name: 'Cedar' } });
  const alpha = await client.db.Publisher.create({ data: { id: 'p-alpha', name: 'Alpha' } });
  const birch = await client.db.Publisher.create({ data: { id: 'p-birch', name: 'Birch' } });

  await client.db.Book.create({ data: { id: 'b1', title: 'one', isbn: 'i1', publisherId: cedar.id } });
  await client.db.Book.create({ data: { id: 'b2', title: 'two', isbn: 'i2', publisherId: alpha.id } });
  await client.db.Book.create({ data: { id: 'b3', title: 'three', isbn: 'i3', publisherId: birch.id } });
  // No publisher at all: the field is NONE
  await client.db.Book.create({ data: { id: 'b4', title: 'four', isbn: 'i4' } });
  // Explicit null
  await client.db.Book.create({ data: { id: 'b5', title: 'five', isbn: 'i5', publisherId: null } });
  await client.db.Book.create({ data: { id: 'b6', title: 'six', isbn: 'i6', publisherId: alpha.id } });
}

export const ids = (rows: { id: { toString(): string } }[]): string[] => rows.map((r) => String(r.id));
