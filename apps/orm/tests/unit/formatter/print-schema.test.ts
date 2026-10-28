/**
 * printSchema: every top-level construct prints from the AST alone and re-parses to an equivalent AST.
 * Comments are kept only when the caller passes attachments computed from source text (band decision D9).
 */

import { describe, expect, it } from 'bun:test';
import type { CommentMap } from '../../../src/formatter/comment-attacher';
import { attachComments } from '../../../src/formatter/comment-attacher';
import { printSchema } from '../../../src/formatter';
import { buildSourceLayout } from '../../../src/formatter/layout';
import { parse } from '../../../src/parser/parser';
import { tokenize } from '../../../src/parser/tokenizer';
import type { SchemaAST } from '../../../src/types';

interface Names {
  objects: Set<string>;
  tuples: Set<string>;
  literals: Set<string>;
  enums: Set<string>;
}

function parseOk(source: string, names?: Names): SchemaAST {
  const { ast, errors } = parse(source, names?.objects, names?.tuples, names?.literals, names?.enums);
  if (errors.length) throw new Error(errors.map((e) => e.message).join('; '));

  return ast;
}

function namesOf(ast: SchemaAST): Names {
  return {
    objects: new Set(ast.objects.map((o) => o.name)),
    tuples: new Set(ast.tuples.map((t) => t.name)),
    literals: new Set(ast.literals.map((l) => l.name)),
    enums: new Set(ast.enums.map((e) => e.name)),
  };
}

/** Drop everything that is position or provenance rather than structure */
function structure(ast: SchemaAST): unknown {
  return JSON.parse(
    JSON.stringify(ast, (key, value) => (['range', 'origin', 'source'].includes(key) ? undefined : value)),
  );
}

/** parse, print, parse again; returns the printed text after asserting the structures match */
function roundTrip(source: string): string {
  const ast = parseOk(source);
  const printed = printSchema(ast);
  const again = parseOk(printed, namesOf(ast));

  expect(structure(again)).toEqual(structure(ast));
  // Printing the re-parsed AST gives the same text
  expect(printSchema(again)).toBe(printed);

  return printed;
}

describe('printSchema round trip', () => {
  it('prints a model with every field shape, decorators and directives', () => {
    const printed = roundTrip(`model User {
  id Record @id
  name String @unique
  email Email?
  tags String[] @set
  score Float @default(1.5)
  role String @default('it\\'s')
  @@index(byName, [name, email])
  @@unique(uniq, [email])
}
`);
    expect(printed).toContain('model User {');
    expect(printed).toContain('@@index(byName, [name, email])');
  });

  it('prints abstract models with extends, pick and omit filters and !!private', () => {
    const printed = roundTrip(`abstract model Base {
  id Record @id
  secret String !!private
  createdAt Date @createdAt
}
model A extends Base {
  name String
}
model B extends Base[id, name] {
  name String
}
model C extends Base[!secret] {
  name String
}
`);
    expect(printed).toContain('abstract model Base {');
    expect(printed).toContain('model B extends Base[id, name] {');
    expect(printed).toContain('model C extends Base[!secret] {');
    expect(printed).toContain('!!private');
  });

  it('prints objects, extends forms on objects, and object-typed fields', () => {
    const printed = roundTrip(`object Geo {
  lat Float
  lng Float
}
object Address extends Geo[lat] {
  street String
  extra Geo?
  many Geo[]
}
model Place {
  id Record @id
  address Address
}
`);
    expect(printed).toContain('object Address extends Geo[lat] {');
  });

  it('prints tuples with named, positional, optional, nullable and decorated elements', () => {
    const printed =
      roundTrip(`tuple Pair { a Float @nullable, b Int? @default(3), String, c Date @createdAt, d Date @updatedAt, e String @default('x y'), f String @default("it's"), g String @default('1abc') }
tuple Wide extends Pair[a, b] { a Float, b Int }
tuple Nested { Pair, Wide, Inner }
object Inner {
  x Int
}
`);
    expect(printed).toContain('tuple Pair {');
    expect(printed).toContain('a Float @nullable');
    expect(printed).toContain('tuple Wide extends Pair[a, b] {');
  });

  it('prints tuple elements that reference literals', () => {
    roundTrip(`literal Color { 'red', 'blue' }
tuple Shade { Color, Int }
`);
  });

  it('prints enums, including extends forms', () => {
    const printed = roundTrip(`enum Role { ADMIN, USER, GUEST }
enum Staff extends Role[ADMIN, USER] { ADMIN, USER }
enum Plain extends Role[!GUEST] { ADMIN, USER }
`);
    expect(printed).toContain('enum Role {\n  ADMIN,\n  USER,\n  GUEST\n}');
    expect(printed).toContain('enum Plain extends Role[!GUEST] {');
  });

  it('prints every literal variant kind', () => {
    const printed = roundTrip(`object Box {
  w Int
}
tuple Point { Float, Float }
literal Inner { 'a', 'b' }
literal Mixed { 'text', "it's", 7, -3, 1.5, 2.0, true, false, String, Int, Float, Bool, Box, Point, Inner }
literal Derived extends Mixed[7, true] { 7, true }
`);
    expect(printed).toContain("'text'");
    expect(printed).toContain('2.0');
    expect(printed).toContain('Box');
    expect(printed).toContain('Point');
    expect(printed).toContain('Inner');
    expect(printed).toContain('literal Derived extends Mixed[7, true] {');
  });

  it('prints a model that mixes every construct, in declaration order', () => {
    const printed = roundTrip(`enum Role { A, B }
literal Status { 'on', 'off' }
object Meta {
  note String?
}
tuple Pos { Float, Float }
model Thing {
  id Record @id
  role Role
  status Status
  meta Meta
  pos Pos
}
`);
    expect(printed.indexOf('enum Role')).toBeLessThan(printed.indexOf('literal Status'));
    expect(printed.indexOf('tuple Pos')).toBeLessThan(printed.indexOf('model Thing'));
  });

  it('prints a layout-less AST in the canonical form: two blank lines between blocks, none inside', () => {
    const printed = printSchema(
      parseOk(`model A {
  id Record @id

  name String
}

model B {
  id Record @id
}
`),
    );
    expect(printed).toBe('model A {\n  id   Record @id\n  name String\n}\n\n\nmodel B {\n  id Record @id\n}\n');
  });
});

describe('printSchema comments', () => {
  const source = `# file header

# leads the enum
enum Role { A, B }

/* block comment
   over two lines */
model User { # trailing the model line
  # leads the id
  id Record @id # trailing the id
  // slash comment on name
  name String
  # leads the directive
  @@index(byName, [name]) # trailing the directive
}

# after everything
`;

  function attachFrom(text: string): { ast: SchemaAST; comments: CommentMap } {
    const ast = parseOk(text);

    return { ast, comments: attachComments(tokenize(text), ast) };
  }

  /** key -> comment text for the attachment, so the comparison reads as "this text on that node" */
  function summarize(map: CommentMap): Record<string, { leading: string[]; trailing: string[] }> {
    const out: Record<string, { leading: string[]; trailing: string[] }> = {};
    for (const [key, v] of map)
      out[key] = { leading: v.leading.map((t) => t.value), trailing: v.trailing.map((t) => t.value) };

    return out;
  }

  it('keeps leading, trailing, block and file-level comments on the node they attach to', () => {
    const { ast, comments } = attachFrom(source);
    const printed = printSchema(ast, { comments, layout: buildSourceLayout(tokenize(source)) });

    const reattached = attachFrom(printed).comments;
    expect(summarize(reattached)).toEqual(summarize(comments));
    expect(printed).toContain('# trailing the id');
    expect(printed).toContain('// slash comment on name');
    expect(printed).toContain('# after everything');
    expect(summarize(comments)['model:User']!.leading[0]).toStartWith('/* block comment');
    expect(summarize(comments)['field:User.id']!.trailing).toEqual(['# trailing the id']);
    expect(summarize(comments)['enum:Role']!.leading).toEqual(['# leads the enum']);
  });

  it('keeps the comments through a second print', () => {
    const { ast, comments } = attachFrom(source);
    const once = printSchema(ast, { comments });
    const { ast: ast2, comments: comments2 } = attachFrom(once);

    expect(printSchema(ast2, { comments: comments2 })).toBe(once);
  });

  it('drops every comment when no attachments are passed', () => {
    const { ast } = attachFrom(source);
    const printed = printSchema(ast);

    expect(printed).not.toMatch(/#|\/\*/);
    expect(structure(parseOk(printed))).toEqual(structure(ast));
  });
});
