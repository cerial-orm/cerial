import { describe, expect, test } from 'bun:test';
import { validateRelationRules } from '../../../src/cli/validators/relation-validator';
import { f, model, modelNode } from '../../../src/parser/builder';
import type { Handle } from '../../../src/parser/builder';
import { parse } from '../../../src/parser/parser';
import type { SchemaAST } from '../../../src/types';

type Model = Handle<string, string>;

function builtAst(...models: Model[]): SchemaAST {
  return { models: models.map((m) => modelNode(m)), objects: [], tuples: [], literals: [], enums: [], source: '' };
}

function parsedAst(source: string): SchemaAST {
  const { ast, errors } = parse(source);
  expect(errors).toHaveLength(0);

  return ast;
}

/** What a refusal says and which field it names; `line` is left out because a built node has no source line. */
function refusals(ast: SchemaAST): { message: string; model?: string; field?: string }[] {
  return validateRelationRules(ast).map(({ message, model: m, field }) => ({ message, model: m, field }));
}

interface Schema {
  readonly built: () => SchemaAST;
  readonly text: string;
}

interface Rule {
  readonly name: string;
  readonly message: string;
  readonly violating: Schema;
  readonly corrected: Schema;
}

const rules: Rule[] = [
  {
    name: '@key required',
    message: 'Multiple relations to "User" require @key for disambiguation. Add @key(name) to "author"',
    violating: {
      built: () => {
        const User: Model = model('User', { id: f.record().id() });
        const Post: Model = model('Post', {
          id: f.record().id(),
          author: f.relation(() => User).optional(),
          reviewer: f.relation(() => User).optional(),
        });

        return builtAst(User, Post);
      },
      text: `
model User {
  id Record @id
}
model Post {
  id Record @id
  authorId Record?
  author Relation? @field(authorId) @model(User)
  reviewerId Record?
  reviewer Relation? @field(reviewerId) @model(User)
}`,
    },
    corrected: {
      built: () => {
        const User: Model = model('User', {
          id: f.record().id(),
          authored: f
            .reverse(() => Post)
            .array()
            .key('author'),
          reviewed: f
            .reverse(() => Post)
            .array()
            .key('reviewer'),
        });
        const Post: Model = model('Post', {
          id: f.record().id(),
          author: f.relation(() => User).key('author'),
          reviewer: f.relation(() => User).key('reviewer'),
        });

        return builtAst(User, Post);
      },
      text: `
model User {
  id Record @id
  authored Relation[] @model(Post) @key(author)
  reviewed Relation[] @model(Post) @key(reviewer)
}
model Post {
  id Record @id
  authorId Record
  author Relation @field(authorId) @model(User) @key(author)
  reviewerId Record
  reviewer Relation @field(reviewerId) @model(User) @key(reviewer)
}`,
    },
  },
  {
    name: '@key unique per model pair',
    message: 'Duplicate @key(shared) for relations to "User"',
    violating: {
      built: () => {
        const User: Model = model('User', { id: f.record().id() });
        const Post: Model = model('Post', {
          id: f.record().id(),
          author: f
            .relation(() => User)
            .optional()
            .key('shared'),
          reviewer: f
            .relation(() => User)
            .optional()
            .key('shared'),
        });

        return builtAst(User, Post);
      },
      text: `
model User {
  id Record @id
}
model Post {
  id Record @id
  authorId Record?
  author Relation? @field(authorId) @model(User) @key(shared)
  reviewerId Record?
  reviewer Relation? @field(reviewerId) @model(User) @key(shared)
}`,
    },
    corrected: {
      built: () => {
        const User: Model = model('User', {
          id: f.record().id(),
          authored: f
            .reverse(() => Post)
            .array()
            .key('author'),
          reviewed: f
            .reverse(() => Post)
            .array()
            .key('reviewer'),
        });
        const Post: Model = model('Post', {
          id: f.record().id(),
          author: f.relation(() => User).key('author'),
          reviewer: f.relation(() => User).key('reviewer'),
        });

        return builtAst(User, Post);
      },
      text: `
model User {
  id Record @id
  authored Relation[] @model(Post) @key(author)
  reviewed Relation[] @model(Post) @key(reviewer)
}
model Post {
  id Record @id
  authorId Record
  author Relation @field(authorId) @model(User) @key(author)
  reviewerId Record
  reviewer Relation @field(reviewerId) @model(User) @key(reviewer)
}`,
    },
  },
  {
    name: 'forward and reverse pairing',
    message: '@key(author) on forward relation "author" requires matching reverse relation in "User"',
    violating: {
      built: () => {
        const User: Model = model('User', { id: f.record().id() });
        const Post: Model = model('Post', {
          id: f.record().id(),
          author: f
            .relation(() => User)
            .optional()
            .key('author'),
        });

        return builtAst(User, Post);
      },
      text: `
model User {
  id Record @id
}
model Post {
  id Record @id
  authorId Record?
  author Relation? @field(authorId) @model(User) @key(author)
}`,
    },
    corrected: {
      built: () => {
        const User: Model = model('User', {
          id: f.record().id(),
          posts: f
            .reverse(() => Post)
            .array()
            .key('author'),
        });
        const Post: Model = model('Post', {
          id: f.record().id(),
          author: f.relation(() => User).key('author'),
        });

        return builtAst(User, Post);
      },
      text: `
model User {
  id Record @id
  posts Relation[] @model(Post) @key(author)
}
model Post {
  id Record @id
  authorId Record
  author Relation @field(authorId) @model(User) @key(author)
}`,
    },
  },
  {
    name: 'reverse requires a PK side',
    message: 'Reverse relation "posts" requires PK side (Record + Relation @field) in model "Post"',
    violating: {
      built: () => {
        const Post: Model = model('Post', { id: f.record().id() });
        const User: Model = model('User', { id: f.record().id(), posts: f.reverse(() => Post).array() });

        return builtAst(User, Post);
      },
      text: `
model User {
  id Record @id
  posts Relation[] @model(Post)
}
model Post {
  id Record @id
}`,
    },
    corrected: {
      built: () => {
        const User: Model = model('User', { id: f.record().id(), posts: f.reverse(() => Post).array() });
        const Post: Model = model('Post', { id: f.record().id(), author: f.relation(() => User) });

        return builtAst(User, Post);
      },
      text: `
model User {
  id Record @id
  posts Relation[] @model(Post)
}
model Post {
  id Record @id
  authorId Record
  author Relation @field(authorId) @model(User)
}`,
    },
  },
  {
    name: 'single-sided optionality',
    message: 'Single-sided relation "author" must be optional (Relation?) because no reverse is defined in "User"',
    violating: {
      built: () => {
        const User: Model = model('User', { id: f.record().id() });
        const Post: Model = model('Post', { id: f.record().id(), author: f.relation(() => User) });

        return builtAst(User, Post);
      },
      text: `
model User {
  id Record @id
}
model Post {
  id Record @id
  authorId Record
  author Relation @field(authorId) @model(User)
}`,
    },
    corrected: {
      built: () => {
        const User: Model = model('User', { id: f.record().id() });
        const Post: Model = model('Post', { id: f.record().id(), author: f.relation(() => User).optional() });

        return builtAst(User, Post);
      },
      text: `
model User {
  id Record @id
}
model Post {
  id Record @id
  authorId Record?
  author Relation? @field(authorId) @model(User)
}`,
    },
  },
];

describe('the five cross-model relation rules refuse a built AST', () => {
  describe.each(rules)('$name', ({ message, violating, corrected }) => {
    test('the built schema is refused with the message the DSL gives', () => {
      const built = refusals(violating.built());

      expect(built.map((e) => e.message)).toContain(message);
      expect(built).toEqual(refusals(parsedAst(violating.text)));
    });

    test('the corrected schema passes in both forms', () => {
      expect(refusals(corrected.built())).toEqual([]);
      expect(refusals(parsedAst(corrected.text))).toEqual([]);
    });
  });
});
