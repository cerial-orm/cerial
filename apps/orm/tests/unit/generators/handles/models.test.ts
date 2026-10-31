import { describe, expect, it } from 'bun:test';
import { emitHandles } from '../../../../src/generators/handles';
import { lineOf, parseSchema } from './helpers';

describe('emitHandles models', () => {
  it('records the id type: a primitive, a union and a plain Record', () => {
    const text = emitHandles(
      parseSchema(`
model Num {
  id Record(int) @id
}
model Either {
  id Record(string, int) @id
}
model Plain {
  id Record @id
}
model Keyless {
  name String
}
`),
    );
    expect(lineOf(text, 'Num')).toContain('id: ["int"]');
    expect(lineOf(text, 'Either')).toContain('id: ["string", "int"]');
    expect(lineOf(text, 'Plain')).toContain('id: []');
    // A model with no @id field carries no id key at all, which the handle types as `never`
    expect(lineOf(text, 'Keyless')).not.toContain('id:');
  });

  it('lists relation fields and foreign keys as members', () => {
    const text = emitHandles(
      parseSchema(`
model Author {
  id Record @id
  posts Relation[] @model(Post)
}
model Post {
  id Record @id
  authorId Record
  author Relation @field(authorId) @model(Author)
}
`),
    );
    expect(lineOf(text, 'Post')).toContain('members: ["id", "authorId", "author"]');
  });

  it('lists !!private fields, and none when there are none', () => {
    const text = emitHandles(
      parseSchema(`
model Account {
  id Record @id
  secret String !!private
  name String
}
model Open {
  id Record @id
}
`),
    );
    expect(lineOf(text, 'Account')).toContain('private: ["secret"]');
    expect(lineOf(text, 'Open')).not.toContain('private');
  });

  it('includes the members a .cerial child inherits from a .cerial parent', () => {
    const text = emitHandles(
      parseSchema(`
abstract model Base {
  id Record(int) @id
  createdBy String
  secret String !!private
}
model Child extends Base {
  title String
}
model Picked extends Base[createdBy, id] {
  extra String
}
model Omitted extends Base[!createdBy] {
  extra String
}
`),
    );
    const child = lineOf(text, 'Child');
    for (const m of ['"id"', '"createdBy"', '"secret"', '"title"']) expect(child).toContain(m);
    expect(child).toContain('id: ["int"]');
    expect(lineOf(text, 'Picked')).toContain('members: ["id", "createdBy", "extra"]');
    expect(lineOf(text, 'Omitted')).not.toContain('"createdBy"');
  });

  it('keeps an abstract parent reachable and says it is abstract', () => {
    const text = emitHandles(parseSchema('abstract model Base {\n  id Record @id\n}\nmodel Real {\n  name String\n}'));
    expect(lineOf(text, 'Base')).toContain('handle.model("Base"');
    expect(text).toContain('// Abstract');
    expect(text.split('// Abstract').length - 1).toBe(1);
  });
});
