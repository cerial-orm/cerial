import type { CerialClient } from '../../test-helper';

/**
 * Two authors with posts whose bodies are 'draft' or 'live'. Titles sort differently from insertion
 * order, and the first two titles in sort order are not both live, so a filter applied after the
 * limit returns fewer rows than one applied before it.
 */
export async function seedAuthorsAndPosts(client: CerialClient): Promise<void> {
  const zed = await client.db.Author.create({ data: { id: 'a-zed', name: 'Zed', email: 'z@x.test' } });
  const amy = await client.db.Author.create({ data: { id: 'a-amy', name: 'Amy', email: 'a@x.test' } });
  await client.db.Author.create({ data: { id: 'a-bob', name: 'Bob', email: 'b@x.test' } });

  const posts: [string, string, string, typeof zed][] = [
    ['p3', 'c', 'draft', zed],
    ['p1', 'a', 'draft', zed],
    ['p5', 'e', 'live', zed],
    ['p2', 'b', 'live', zed],
    ['p4', 'd', 'live', zed],
    ['p6', 'x', 'draft', amy],
  ];

  for (const [id, title, body, author] of posts)
    await client.db.PostRequired.create({ data: { id, title, body, authorId: author.id } });
}

/** Students and courses linked through the forward array on both sides; connect keeps both arrays in sync. */
export async function seedStudentsAndCourses(client: CerialClient): Promise<void> {
  const math = await client.db.Course.create({ data: { id: 'c-math', name: 'Math', code: 'M1' } });
  const art = await client.db.Course.create({ data: { id: 'c-art', name: 'Art', code: 'A1' } });
  const bio = await client.db.Course.create({ data: { id: 'c-bio', name: 'Bio', code: 'B1' } });

  await client.db.Student.create({
    data: { id: 's-ann', name: 'Ann', email: 'ann@x.test', courses: { connect: [math.id, art.id, bio.id] } },
  });
  await client.db.Student.create({
    data: { id: 's-ben', name: 'Ben', email: 'ben@x.test', courses: { connect: [math.id] } },
  });
  await client.db.Student.create({
    data: { id: 's-cy', name: 'Cy', email: 'cy@x.test', courses: { connect: [art.id] } },
  });
}
