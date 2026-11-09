/**
 * Unit Tests: include of a reverse Relation[] whose other side is a one-directional Record[]
 *
 * The related rows hold a list of keys, so a row links back when the list holds the parent. Comparing the
 * list to the parent's id matched nothing and the include came back empty.
 */

import { describe, expect, test } from 'bun:test';
import { compileFindMany } from '../../../src/query/builder';
import { registryFor } from './helpers';

const registry = registryFor(`
model Post {
  id Record @id
  name String
  tagIds Record[]
  tags Relation[] @field(tagIds) @model(Tag)
}

model Tag {
  id Record @id
  name String
  posts Relation[] @model(Post)
}

model Owner {
  id Record @id
  pets Relation[] @model(Pet)
}

model Pet {
  id Record @id
  name String
  ownerId Record
  owner Relation @field(ownerId) @model(Owner)
}
`);

const text = (model: string, include: Record<string, unknown>): string =>
  compileFindMany(registry[model]!, { include } as never, registry).query.text;

describe('include over a reverse relation', () => {
  test('a Record[] on the other side is matched by containment', () => {
    const sql = text('Tag', { posts: true });
    expect(sql).toContain('tagIds CONTAINS $parent.id');
    expect(sql).not.toContain('tagIds = $parent.id');
  });

  test('containment also applies with where, orderBy and limit on the include', () => {
    const sql = text('Tag', { posts: { where: { name: 'a' }, orderBy: { name: 'asc' }, limit: 2 } });
    expect(sql).toContain('tagIds CONTAINS $parent.id');
    expect(sql).toContain('name');
  });

  test('a single foreign key is still compared by equality', () => {
    const sql = text('Owner', { pets: true });
    expect(sql).toContain('ownerId = $parent.id');
    expect(sql).not.toContain('CONTAINS');
  });
});
