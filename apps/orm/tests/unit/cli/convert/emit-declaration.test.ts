import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compareExact } from '../../../../src/cli/convert/compare';
import {
  emitEnum,
  emitLiteral,
  emitModel,
  emitObject,
  emitTuple,
} from '../../../../src/cli/convert/emit-ts/declaration';
import type { EmittedDeclaration } from '../../../../src/cli/convert/emit-ts/declaration';
import { BUILDER_IMPORTS, assignBindings, bindingFor, isSafeBinding } from '../../../../src/cli/convert/emit-ts/names';
import { CerialGenerationError } from '../../../../src/errors';
import { loadDeclarations, materialise } from '../../../../src/parser/builder';
import { parse } from '../../../../src/parser/parser';
import type { SchemaAST } from '../../../../src/types';

const SCHEMA_MODULE = resolve(import.meta.dir, '../../../../src/schema');
const CORPUS = resolve(import.meta.dir, '../../../e2e/schemas');
const dirs: string[] = [];

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function parsed(source: string): SchemaAST {
  const { ast, errors } = parse(source);
  expect(errors).toEqual([]);

  return ast;
}

function emitAll(ast: SchemaAST): EmittedDeclaration[] {
  const bindings = assignBindings(
    [...ast.enums, ...ast.literals, ...ast.objects, ...ast.tuples, ...ast.models].map((node) => node.name),
  );
  const context = { binding: (name: string) => bindings.get(name) ?? name };

  return [
    ...ast.enums.map((node) => emitEnum(node, context)),
    ...ast.literals.map((node) => emitLiteral(node, context)),
    ...ast.objects.map((node) => emitObject(node, context)),
    ...ast.tuples.map((node) => emitTuple(node, context)),
    ...ast.models.map((node) => emitModel(node, context)),
  ];
}

function moduleText(declarations: readonly EmittedDeclaration[]): string {
  const uses = [...new Set(declarations.flatMap((d) => d.uses))].sort();
  const names = uses.map((name) => (name === 'enumeration' ? 'enum as enumeration' : name));

  return `import { ${names.join(', ')} } from '${SCHEMA_MODULE}';\n\n${declarations.map((d) => d.text).join('\n\n')}\n`;
}

interface Built {
  readonly text: string;
  readonly declarations: EmittedDeclaration[];
  readonly built: SchemaAST;
  readonly source: SchemaAST;
  /** Differences with the tolerance the emitter itself asked for, and nothing else. */
  readonly differences: string[];
}

/** Emits the AST, loads the module against the real builder, and compares the result with the source. */
async function roundTrip(source: SchemaAST): Promise<Built> {
  const declarations = emitAll(source);
  const text = moduleText(declarations);
  const dir = mkdtempSync(join(tmpdir(), 'cerial-emit-decl-'));
  dirs.push(dir);
  const file = join(dir, 'out.schema.ts');
  writeFileSync(file, text);
  const built = materialise(await loadDeclarations([file]));
  const reordered = declarations.filter((d) => d.directiveKindOrder).map((d) => d.name);

  return {
    text,
    declarations,
    built,
    source,
    differences: compareExact(source, built, { tolerate: { directiveKindOrder: reordered } }),
  };
}

async function roundTripText(cerial: string): Promise<Built> {
  return roundTrip(parsed(cerial));
}

function declarationOf(built: Built, name: string): EmittedDeclaration {
  return built.declarations.find((d) => d.name === name)!;
}

const USER = 'model User {\n  id Record @id\n}\n';

describe('options', () => {
  test('writes abstract and extends as handles', async () => {
    const result = await roundTripText(
      'abstract model Base {\n  id Record @id\n}\nmodel Child extends Base {\n  name String\n}\n',
    );
    expect(result.differences).toEqual([]);
    expect(result.text).toContain('{ abstract: true }');
    expect(result.text).toContain('{ extends: Base }');
    expect(result.built.models[0]!.abstract).toBe(true);
  });

  test('writes pick and omit on a model, object, enum and literal', async () => {
    const result = await roundTripText(
      [
        'model Base {\n  id Record @id\n  a String\n  b String\n  c String\n}',
        'model Picked extends Base[a, c] {\n  d String\n}',
        'model Omitted extends Base[!a] {\n  d String\n}',
        'object Shape {\n  x Int\n  y Int\n}',
        'object Flat extends Shape[x] {\n}',
        'object Flat2 extends Shape[!x] {\n}',
        'enum Color { red, green, blue }',
        'enum Warm extends Color[red] {}',
        'enum Cool extends Color[!red] {}',
        "literal Mixed { 'a', 1, true }",
        "literal OnlyA extends Mixed['a'] {}",
        '',
      ].join('\n'),
    );
    expect(result.differences).toEqual([]);
    expect(result.text).toContain("Base.pick('a', 'c')");
    expect(result.text).toContain("Base.omit('a')");
    expect(result.text).toContain("Shape.pick('x')");
    expect(result.text).toContain("Color.omit('red')");
  });

  test('writes a tuple pick by position as numbers', async () => {
    const result = await roundTripText(
      'tuple Pair {\n  Int,\n  String,\n  Bool\n}\ntuple First extends Pair[0, 2] {\n}\n',
    );
    expect(result.differences).toEqual([]);
    expect(result.text).toContain('Pair.pick(0, 2)');
  });

  test('a model with no options gets no options argument', async () => {
    const result = await roundTripText(USER);
    expect(result.differences).toEqual([]);
    expect(result.text).not.toContain('abstract');
    expect(result.text).not.toContain('extends');
    expect(result.text).toMatch(/model\(\n {2}'User',\n {2}\{\n {4}id: f\.record\(\)\.id\(\),\n {2}\},\n\);/);
  });

  test('keeps private fields', async () => {
    const result = await roundTripText(
      'abstract model Base {\n  id Record @id !!private\n  name String\n}\nmodel Child extends Base {\n  note String !!private\n}\n',
    );
    expect(result.differences).toEqual([]);
    expect(result.built.models[1]!.fields[0]!.isPrivate).toBe(true);
  });

  test('writes composite unique and index as options', async () => {
    const result = await roundTripText(
      [
        'object Slot {\n  row String\n}',
        'model Booking {',
        '  id Record @id',
        '  a String',
        '  b String',
        '  slot Slot',
        '  @@index(byA, [a])',
        '  @@index(byAB, [a, b])',
        '  @@unique(uniqueSlot, [a, slot.row])',
        '}',
        'model Single {\n  id Record @id\n  a String\n  @@unique(onlyA, [a])\n}',
        '',
      ].join('\n'),
    );
    expect(result.differences).toEqual([]);
    expect(result.text).toContain("index: [{ name: 'byA', fields: ['a'] }, { name: 'byAB', fields: ['a', 'b'] }]");
    expect(result.text).toContain("unique: { name: 'onlyA', fields: ['a'] }");
    expect(result.built.models[0]!.directives!.map((d) => d.name)).toEqual(['byA', 'byAB', 'uniqueSlot']);
  });

  test('writes tuples in the record form when all are named, the array form otherwise', async () => {
    const result = await roundTripText(
      [
        'tuple Coord {\n  lat Float,\n  lng Float\n}',
        'tuple Mixed {\n  label String,\n  Int,\n  Bool\n}',
        'tuple Plain {\n  Int,\n  Int\n}',
        'tuple Nested {\n  inner Coord,\n  Plain\n}',
        '',
      ].join('\n'),
    );
    expect(result.differences).toEqual([]);
    expect(result.text).toContain("tuple(\n  'Coord',\n  {\n    lat: e.float(),\n    lng: e.float(),\n  },\n)");
    expect(result.text).toContain("[e.string().named('label'), e.int(), e.bool()]");
    expect(result.text).toContain('[e.int(), e.int()]');
    expect(result.text).not.toContain("'lat'");
  });

  test('refuses a relation on an object', () => {
    const node = parsed('model U {\n  id Record @id\n}\n').models[0]!;
    const object = {
      name: 'Bad',
      fields: [{ ...node.fields[0]!, type: 'relation' as const }],
      range: node.range,
      origin: node.origin,
    };
    expect(() => emitObject(object)).toThrow(CerialGenerationError);
  });
});

describe('relations', () => {
  test('derives the key when the field before the relation is exactly what the builder would derive', async () => {
    const result = await roundTripText(
      [
        USER,
        'model Post {',
        '  id Record @id',
        '  authorId Record',
        '  author Relation @field(authorId) @model(User)',
        '  editorId Record?',
        '  editor Relation? @field(editorId) @model(User)',
        '  tagIds Record[]',
        '  tags Relation[] @field(tagIds) @model(User)',
        '}',
        '',
      ].join('\n'),
    );
    expect(result.differences).toEqual([]);
    const text = declarationOf(result, 'Post').text;
    expect(text).toContain("author: f.relation('User')");
    expect(text).toContain("editor: f.relation('User').optional()");
    expect(text).toContain("tags: f.relation('User').array()");
    expect(text).not.toContain('authorId');
    expect(text).not.toContain('.field(');
  });

  test('derives a nullable and an optional key from onDelete', async () => {
    const result = await roundTripText(
      [
        USER,
        'model A {',
        '  id Record @id',
        '  userId Record? @nullable',
        '  user Relation? @field(userId) @model(User) @onDelete(SetNull)',
        '}',
        'model B {',
        '  id Record @id',
        '  userId Record?',
        '  user Relation? @field(userId) @model(User) @onDelete(SetNone)',
        '}',
        'model C {',
        '  id Record @id',
        '  userId Record?',
        '  user Relation? @field(userId) @model(User) @onDelete(Cascade)',
        '}',
        '',
      ].join('\n'),
    );
    expect(result.differences).toEqual([]);
    for (const name of ['A', 'B', 'C']) expect(declarationOf(result, name).text).not.toContain('userId');
    expect(declarationOf(result, 'A').text).toContain(".onDelete('SetNull')");
  });

  test('binds a key the relation would not derive', async () => {
    const cases: Array<[string, string]> = [
      ['a key with another name', 'ownerRef Record\n  owner Relation @field(ownerRef) @model(User)'],
      ['a key not directly before', 'ownerId Record\n  note String\n  owner Relation @field(ownerId) @model(User)'],
      ['a key with a decorator', 'ownerId Record @index\n  owner Relation @field(ownerId) @model(User)'],
      [
        'a key that is optional when the relation is not',
        'ownerId Record?\n  owner Relation @field(ownerId) @model(User)',
      ],
      ['a private key', 'ownerId Record !!private\n  owner Relation @field(ownerId) @model(User)'],
      ['a key declared after the relation', 'owner Relation @field(ownerId) @model(User)\n  ownerId Record'],
      [
        'a key whose relation is optional but whose key is not',
        'ownerId Record\n  owner Relation? @field(ownerId) @model(User)',
      ],
    ];
    for (const [label, lines] of cases) {
      const result = await roundTripText(`${USER}model Post {\n  id Record @id\n  ${lines}\n}\n`);
      expect(result.differences, label).toEqual([]);
      const text = declarationOf(result, 'Post').text;
      expect(text, label).toContain(".field('owner");
      expect(text, label).toMatch(/owner(Id|Ref): f\.record\(\)/);
    }
  });

  test('binds a key inherited from a parent', async () => {
    const result = await roundTripText(
      [
        USER,
        'abstract model Base {\n  id Record @id\n  userId Record? @nullable\n}',
        'model Child extends Base {\n  user Relation? @field(userId) @model(User) @onDelete(Cascade)\n}',
        '',
      ].join('\n'),
    );
    expect(result.differences).toEqual([]);
    expect(declarationOf(result, 'Child').text).toContain(".field('userId')");
  });

  test('writes the reverse side as f.reverse and relation targets as bare strings', async () => {
    const result = await roundTripText(
      [
        USER.replace('}', '  posts Relation[] @model(Post)\n}'),
        'model Post {\n  id Record @id\n  authorId Record\n  author Relation @field(authorId) @model(User)\n}',
        '',
      ].join('\n'),
    );
    expect(result.differences).toEqual([]);
    expect(declarationOf(result, 'User').text).toContain("posts: f.reverse('Post').array()");
    expect(result.text).not.toContain('=>');
  });

  test('a model with no relation is unchanged by the relation pass', async () => {
    const result = await roundTripText('model P {\n  id Record @id\n  ownerId Record\n  name String\n}\n');
    expect(result.differences).toEqual([]);
    expect(declarationOf(result, 'P').text).toContain('ownerId: f.record()');
  });

  test('round-trips the corpus schemas that carry relations', async () => {
    for (const file of [
      'decorators/composite-unique-records.cerial',
      'decorators/on-delete.cerial',
      'features/extends-relations.cerial',
    ]) {
      const result = await roundTripText(readFileSync(join(CORPUS, file), 'utf8'));
      expect(result.differences, file).toEqual([]);
      expect(
        result.declarations.flatMap((d) => d.warnings),
        file,
      ).toEqual([]);
    }
  });

  test('the composite-unique-records relations bind keys that are not beside them', async () => {
    const text = readFileSync(join(CORPUS, 'decorators/composite-unique-records.cerial'), 'utf8');
    const result = await roundTripText(text);
    const registration = declarationOf(result, 'Registration').text;
    expect(registration).toContain("attendee: f.relation('Attendee').field('attendeeId')");
    expect(registration).toContain("workshop: f.relation('Workshop').field('workshopId')");
    expect(registration).toContain('attendeeId: f.record()');
  });
});

describe('directives', () => {
  const ALTERNATING = [
    'model Item {',
    '  id Record @id',
    '  a String',
    '  b String',
    '  @@index(first, [a])',
    '  @@unique(second, [b])',
    '  @@index(third, [a, b])',
    '}',
    '',
  ].join('\n');

  test('groups alternating directives and warns', async () => {
    const result = await roundTripText(ALTERNATING);
    const item = declarationOf(result, 'Item');
    expect(item.warnings).toHaveLength(1);
    expect(item.warnings[0]).toContain('Item');
    expect(item.directiveKindOrder).toBe(true);
    expect(result.built.models[0]!.directives!.map((d) => d.name)).toEqual(['first', 'third', 'second']);
    expect(result.differences).toEqual([]);
  });

  test('the regrouped order is a difference without the tolerance, and only that', async () => {
    const result = await roundTripText(ALTERNATING);
    expect(compareExact(result.source, result.built)).not.toEqual([]);
    expect(compareExact(result.source, result.built, { tolerate: { directiveKindOrder: ['Other'] } })).not.toEqual([]);
    expect(compareExact(result.source, result.built, { tolerate: { directiveKindOrder: ['Item'] } })).toEqual([]);
  });

  test('a non-alternating model gets no warning and no tolerance', async () => {
    for (const lines of [
      '@@index(first, [a])\n  @@index(second, [b])\n  @@unique(third, [b])',
      '@@unique(third, [b])\n  @@index(first, [a])\n  @@index(second, [b])',
      '@@index(first, [a])',
      '',
    ]) {
      const result = await roundTripText(`model Item {\n  id Record @id\n  a String\n  b String\n  ${lines}\n}\n`);
      const item = declarationOf(result, 'Item');
      expect(item.warnings).toEqual([]);
      expect(item.directiveKindOrder).toBe(false);
      expect(compareExact(result.source, result.built)).toEqual([]);
    }
  });
});

describe('identifier safety', () => {
  const RESERVED = ['class', 'f', 'model', 'e', 'variant', 'enumeration', 'let', 'undefined', 'object'];

  test('binds a reserved name safely', async () => {
    for (const name of RESERVED) {
      const result = await roundTripText(`model ${name} {\n  id Record @id\n  label String\n}\n`);
      expect(result.differences, name).toEqual([]);
      const text = declarationOf(result, name).text;
      expect(text, name).toContain(`const _${name} = model(\n  '${name}',`);
      expect(text, name).toContain(`export { _${name} as ${name} };`);
      expect(result.built.models[0]!.name).toBe(name);
    }
  });

  test('extends reaches a reserved parent through its binding', async () => {
    const result = await roundTripText(
      'abstract model class {\n  id Record @id\n}\nmodel Child extends class[!id] {\n  name String\n}\n',
    );
    expect(result.differences).toEqual([]);
    expect(declarationOf(result, 'Child').text).toContain("{ extends: _class.omit('id') }");
  });

  test('ordinary names get no alias', async () => {
    const result = await roundTripText('model User {\n  id Record @id\n}\nobject Address {\n  city String\n}\n');
    expect(result.differences).toEqual([]);
    for (const declaration of result.declarations) {
      expect(declaration.binding).toBe(declaration.name);
      expect(declaration.text).toMatch(/^export const /);
      expect(declaration.text).not.toContain(' as ');
    }
  });

  test('every declaration kind binds a reserved name', async () => {
    const result = await roundTripText(
      [
        'enum default { a, b }',
        "literal new { 'x', 1 }",
        'object this {\n  v Int\n}',
        'tuple delete {\n  Int\n}',
        'model class {\n  id Record @id\n  o this\n}',
        '',
      ].join('\n'),
    );
    expect(result.differences).toEqual([]);
    expect(result.declarations.map((d) => d.binding)).toEqual(['_default', '_new', '_this', '_delete', '_class']);
  });

  test('an alias never lands on a name the module already uses', () => {
    const bindings = assignBindings(['class', '_class', 'f']);
    expect(bindings.get('_class')).toBe('_class');
    expect(bindings.get('class')).toBe('__class');
    expect(bindings.get('f')).toBe('_f');
    expect(new Set(bindings.values()).size).toBe(3);
  });

  test('knows which names are safe', () => {
    for (const name of BUILDER_IMPORTS) expect(isSafeBinding(name)).toBe(false);
    for (const name of ['User', 'Address', 'Model', 'Class', 'fo', 'e1']) {
      expect(isSafeBinding(name)).toBe(true);
      expect(bindingFor(name)).toBe(name);
    }
  });

  test('emits __proto__ as a computed key', async () => {
    const result = await roundTripText(
      [
        'object Holder {\n  __proto__ String\n  plain Int\n}',
        'tuple Pair {\n  __proto__ Int,\n  other Int\n}',
        'model Doc {\n  id Record @id\n  __proto__ String\n}',
        '',
      ].join('\n'),
    );
    expect(result.differences).toEqual([]);
    expect(result.text).toContain("['__proto__']: f.string()");
    expect(result.text).toContain("['__proto__']: e.int()");
    expect(result.built.objects[0]!.fields.map((field) => field.name)).toEqual(['__proto__', 'plain']);
    expect(result.built.models[0]!.fields.map((field) => field.name)).toEqual(['id', '__proto__']);
  });

  test('an ordinary field name is written bare', async () => {
    const result = await roundTripText('model Doc {\n  id Record @id\n  proto String\n  class String\n}\n');
    expect(result.differences).toEqual([]);
    expect(result.text).toContain('proto: f.string()');
    expect(result.text).toContain('class: f.string()');
    expect(result.text).not.toContain("['proto']");
  });

  test('a plain __proto__ key would not have made a field', () => {
    const plain = { __proto__: 'x', other: 'y' } as Record<string, string>;
    expect(Object.keys(plain)).toEqual(['other']);
  });
});
