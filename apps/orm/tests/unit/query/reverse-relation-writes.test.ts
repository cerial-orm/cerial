/**
 * Unit Tests: nested disconnect and set on the reverse side of a relation
 *
 * The reverse side is virtual: the rows that point at the parent hold the foreign key. A disconnect changes
 * the rows it names and only those that point at the parent, `[]` changes nothing, and a set makes exactly
 * the named rows point at the parent. Each statement is pinned whole, because a missing row filter on the
 * UPDATE unlinks every child of the parent.
 */

import { describe, expect, test } from 'bun:test';
import { compileUpdateMany, compileUpdateUnique, compileUpsert } from '../../../src/query/builder';
import { registryFor } from './helpers';

const registry = registryFor(`
model Owner {
  id Record @id
  name String
  pets Relation[] @model(Pet)
}

model Pet {
  id Record @id
  name String
  ownerId Record
  owner Relation @field(ownerId) @model(Owner)
}

model Publisher {
  id Record @id
  name String
  books Relation[] @model(Book)
}

model Book {
  id Record @id
  title String
  publisherId Record? @nullable
  publisher Relation? @field(publisherId) @model(Publisher)
}

model Cat {
  id Record @id
  label String
  tagIds Record[]
  tags Relation[] @field(tagIds) @model(Tag)
}

model Tag {
  id Record @id
  name String
  cats Relation[] @model(Cat)
}
`);
const owner = registry.Owner!;
const publisher = registry.Publisher!;
const tag = registry.Tag!;

const where = { id: 'x' };
const compile = (model: typeof owner, data: Record<string, unknown>) =>
  compileUpdateUnique(model, { where, data }, registry).query;
/** The post-update statements, one per line */
const lines = (text: string): string[] => text.split('\n').filter((l) => /^UPDATE (pet|book|cat)/.test(l));
const idsOf = (vars: Record<string, unknown>, prefix: string): string[] =>
  Object.entries(vars)
    .filter(([key]) => key.startsWith(prefix))
    .flatMap(([, value]) => (value as unknown[]).map(String));

describe('reverse disconnect names the rows it unlinks', () => {
  test('a single foreign key: only the named rows that point at the parent', () => {
    const { text, vars } = compile(publisher, { books: { disconnect: ['book:a'] } });
    expect(lines(text)).toEqual([
      expect.stringMatching(
        /^UPDATE book SET publisherId = NULL WHERE publisherId = \$result\[0\]\.id AND id INSIDE \$rev_disconnect_\w+;$/,
      ),
    ]);
    expect(idsOf(vars, 'rev_disconnect')).toEqual(['book:a']);
  });

  test('no statement clears every row that points at the parent', () => {
    for (const disconnect of [['book:a'], 'book:a', ['book:a', 'book:b']]) {
      const { text } = compile(publisher, { books: { disconnect } });
      expect(text).not.toMatch(/publisherId = \$result\[0\]\.id;/);
      expect(text).toContain('AND id INSIDE');
    }
  });

  test('a single id is the list of one, as connect takes it', () => {
    const single = compile(publisher, { books: { disconnect: 'book:a' } });
    const list = compile(publisher, { books: { disconnect: ['book:a'] } });
    expect(lines(single.text)).toEqual(lines(list.text));
    expect(idsOf(single.vars, 'rev_disconnect')).toEqual(['book:a']);
  });

  test('several ids are all bound, in order', () => {
    const { vars } = compile(publisher, { books: { disconnect: ['book:a', 'book:c'] } });
    expect(idsOf(vars, 'rev_disconnect')).toEqual(['book:a', 'book:c']);
  });

  test('true unlinks every row that points at the parent, and only those', () => {
    const { text } = compile(publisher, { books: { disconnect: true } });
    expect(lines(text)).toEqual(['UPDATE book SET publisherId = NULL WHERE publisherId = $result[0].id AND true;']);
  });

  test('an empty list and false change nothing', () => {
    for (const disconnect of [[], false]) {
      const { text, vars } = compile(publisher, { books: { disconnect } });
      expect(lines(text)).toEqual([]);
      expect(idsOf(vars, 'rev_disconnect')).toEqual([]);
    }
  });

  test('a non-nullable key is cleared to NONE, a required one by the database refusing it', () => {
    expect(lines(compile(owner, { pets: { disconnect: ['pet:a'] } }).text)).toEqual([
      expect.stringMatching(/^UPDATE pet SET ownerId = NONE WHERE ownerId = \$result\[0\]\.id AND id INSIDE /),
    ]);
  });

  test('an array foreign key loses only the parent, and only on the named rows that hold it', () => {
    const { text, vars } = compile(tag, { cats: { disconnect: ['cat:a'] } });
    expect(lines(text)).toEqual([
      expect.stringMatching(
        /^UPDATE cat SET tagIds -= \$result\[0\]\.id WHERE tagIds CONTAINS \$result\[0\]\.id AND id INSIDE \$rev_disconnect_\w+;$/,
      ),
    ]);
    expect(idsOf(vars, 'rev_disconnect')).toEqual(['cat:a']);
  });

  test('every write method emits the same filtered statement', () => {
    const data = { books: { disconnect: ['book:a'] } };
    const texts = [
      compileUpdateUnique(publisher, { where, data }, registry).query.text,
      compileUpdateMany(publisher, { where: { name: 'p' }, data }, registry).query.text,
      compileUpsert(publisher, { where, create: { name: 'p' }, update: data }, registry).query.text,
    ];
    for (const text of texts) expect(lines(text).join()).toContain('AND id INSIDE $');
  });

  test('an id of another table is refused', () => {
    expect(() => compile(publisher, { books: { disconnect: ['publisher:a'] } })).toThrow(/book/);
  });

  test('connect and disconnect on the same relation are both written', () => {
    const { text } = compile(publisher, { books: { connect: ['book:n'], disconnect: ['book:a'] } });
    expect(text).toContain('publisherId = NULL WHERE publisherId = $result[0].id AND id INSIDE');
    expect(text).toMatch(/SET publisherId = \$result\[0\]\.id WHERE id INSIDE \$rev_connect_0;/);
  });
});

describe('reverse set makes exactly the named rows point at the parent', () => {
  test('single foreign key: unlink the others, then link the named rows', () => {
    const { text, vars } = compile(publisher, { books: { set: ['book:a', 'book:b'] } });
    expect(lines(text)).toEqual([
      expect.stringMatching(
        /^UPDATE book SET publisherId = NULL WHERE publisherId = \$result\[0\]\.id AND !\(id INSIDE \$rev_set_\w+\);$/,
      ),
      expect.stringMatching(/^UPDATE book SET publisherId = \$result\[0\]\.id WHERE id INSIDE \$rev_set_\w+;$/),
    ]);
    expect(idsOf(vars, 'rev_set')).toEqual(['book:a', 'book:b']);
  });

  test('an empty set unlinks every row that points at the parent and links none', () => {
    const { text } = compile(publisher, { books: { set: [] } });
    expect(lines(text)).toEqual([expect.stringMatching(/AND !\(id INSIDE \$rev_set_\w+\);$/)]);
  });

  test('array foreign key: remove the parent from the others, add it to the named rows once', () => {
    const { text } = compile(tag, { cats: { set: ['cat:a'] } });
    expect(lines(text)).toEqual([
      expect.stringMatching(
        /^UPDATE cat SET tagIds -= \$result\[0\]\.id WHERE tagIds CONTAINS \$result\[0\]\.id AND !\(id INSIDE \$rev_set_\w+\);$/,
      ),
      expect.stringMatching(
        /^UPDATE cat SET tagIds \+= \$result\[0\]\.id WHERE id INSIDE \$rev_set_\w+ AND !\(tagIds CONTAINS \$result\[0\]\.id\);$/,
      ),
    ]);
  });

  test('the named rows are checked to exist before anything is written', () => {
    const query = compile(publisher, { books: { set: ['book:a'] } });
    expect(query.targetCheck?.entries).toEqual([{ field: 'books', verb: 'set', targetModel: 'Book', id: 'book:a' }]);
  });
});
