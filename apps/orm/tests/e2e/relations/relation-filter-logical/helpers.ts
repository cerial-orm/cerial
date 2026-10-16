import type { CerialClient, PostRequiredWhere } from '../../test-helper';

/**
 * Three authors and five posts. Zed owns a and d, Amy owns b and e, Bob owns c. Each filter in the
 * suite selects a different subset of titles, so a clause that was dropped (every row) or inverted
 * (the complement) fails the exact-title assertion.
 */
export async function seedAuthorsAndPosts(client: CerialClient): Promise<void> {
  const zed = await client.db.Author.create({ data: { id: 'a-zed', name: 'Zed', email: 'z@x.test' } });
  const amy = await client.db.Author.create({ data: { id: 'a-amy', name: 'Amy', email: 'a@x.test' } });
  const bob = await client.db.Author.create({ data: { id: 'a-bob', name: 'Bob', email: 'b@x.test' } });
  // An author with no posts, so a reverse filter has a row it must exclude
  await client.db.Author.create({ data: { id: 'a-cat', name: 'Cat', email: 'c@x.test' } });

  const posts: [string, string, typeof zed][] = [
    ['p1', 'a', zed],
    ['p2', 'b', amy],
    ['p3', 'c', bob],
    ['p4', 'd', zed],
    ['p5', 'e', amy],
  ];

  for (const [id, title, author] of posts)
    await client.db.PostRequired.create({ data: { id, title, authorId: author.id } });
}

/** Titles, sorted, so a result compares without depending on row order. */
export const titlesOf = (rows: { title: string }[]): string[] => rows.map((r) => r.title).sort();

/** Names, sorted. */
export const namesOf = (rows: { name: string }[]): string[] => rows.map((r) => r.name).sort();

/** One forward-relation filter per logical operator, with the titles it must select. */
export const forwardCases: { label: string; where: PostRequiredWhere; titles: string[] }[] = [
  { label: 'OR', where: { author: { OR: [{ name: 'Zed' }, { name: 'Amy' }] } }, titles: ['a', 'b', 'd', 'e'] },
  { label: 'AND', where: { author: { AND: [{ name: 'Zed' }, { email: 'z@x.test' }] } }, titles: ['a', 'd'] },
  { label: 'NOT', where: { author: { NOT: { name: 'Zed' } } }, titles: ['b', 'c', 'e'] },
];
