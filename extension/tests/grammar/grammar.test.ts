import { beforeAll, describe, expect, it } from 'bun:test';
import type { IGrammar } from 'vscode-textmate';
import {
  findToken,
  getGrammar,
  hasScope,
  type LineTokens,
  type TokenInfo,
  tokenizeFixture,
  tokenizeLine,
  tokensWithScope,
} from './helpers';

let grammar: IGrammar;

beforeAll(async () => {
  grammar = await getGrammar();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find the first non-whitespace token matching exact text on a tokenized line */
function tok(lineTokens: LineTokens[], lineIdx: number, text: string): TokenInfo | undefined {
  return findToken(lineTokens[lineIdx].tokens, text);
}

/** Assert token text has a scope fragment */
function assertScope(token: TokenInfo | undefined, fragment: string): void {
  expect(token).toBeDefined();
  const match = token!.scopes.some((s) => s.includes(fragment));
  if (!match) {
    throw new Error(`Expected scope containing "${fragment}" for "${token!.text}", got: [${token!.scopes.join(', ')}]`);
  }
}

// ===========================================================================
// 1. BLOCK KEYWORDS
// ===========================================================================

describe('Block Keywords', () => {
  it('model keyword → storage.type.model.cerial', () => {
    const tokens = tokenizeLine(grammar, 'model User {');
    const modelTok = findToken(tokens, 'model');
    assertScope(modelTok, 'storage.type.model.cerial');
  });

  it('model name → entity.name.type.model.cerial', () => {
    const tokens = tokenizeLine(grammar, 'model User {');
    const nameTok = findToken(tokens, 'User');
    assertScope(nameTok, 'entity.name.type.model.cerial');
  });

  it('abstract model → storage.modifier.abstract.cerial + storage.type.model.cerial', () => {
    const tokens = tokenizeLine(grammar, 'abstract model BaseEntity {');
    const abstractTok = findToken(tokens, 'abstract');
    const modelTok = findToken(tokens, 'model');
    assertScope(abstractTok, 'storage.modifier.abstract.cerial');
    assertScope(modelTok, 'storage.type.model.cerial');
  });

  it('object keyword → storage.type.object.cerial', () => {
    const tokens = tokenizeLine(grammar, 'object Address {');
    const objectTok = findToken(tokens, 'object');
    assertScope(objectTok, 'storage.type.object.cerial');
  });

  it('object name → entity.name.type.object.cerial', () => {
    const tokens = tokenizeLine(grammar, 'object Address {');
    const nameTok = findToken(tokens, 'Address');
    assertScope(nameTok, 'entity.name.type.object.cerial');
  });

  it('tuple keyword → storage.type.tuple.cerial', () => {
    const tokens = tokenizeLine(grammar, 'tuple Point3D {');
    const tupleTok = findToken(tokens, 'tuple');
    assertScope(tupleTok, 'storage.type.tuple.cerial');
  });

  it('tuple name → entity.name.type.tuple.cerial', () => {
    const tokens = tokenizeLine(grammar, 'tuple Point3D {');
    const nameTok = findToken(tokens, 'Point3D');
    assertScope(nameTok, 'entity.name.type.tuple.cerial');
  });

  it('enum keyword → storage.type.enum.cerial', () => {
    const tokens = tokenizeLine(grammar, 'enum Status { ACTIVE, INACTIVE }');
    const enumTok = findToken(tokens, 'enum');
    assertScope(enumTok, 'storage.type.enum.cerial');
  });

  it('enum name → entity.name.type.enum.cerial', () => {
    const tokens = tokenizeLine(grammar, 'enum Status { ACTIVE, INACTIVE }');
    const nameTok = findToken(tokens, 'Status');
    assertScope(nameTok, 'entity.name.type.enum.cerial');
  });

  it('literal keyword → storage.type.literal.cerial', () => {
    const tokens = tokenizeLine(grammar, 'literal Severity { 1, 2, 3 }');
    const literalTok = findToken(tokens, 'literal');
    assertScope(literalTok, 'storage.type.literal.cerial');
  });

  it('literal name → entity.name.type.literal.cerial', () => {
    const tokens = tokenizeLine(grammar, 'literal Severity { 1, 2, 3 }');
    const nameTok = findToken(tokens, 'Severity');
    assertScope(nameTok, 'entity.name.type.literal.cerial');
  });

  it('block open brace → punctuation.section.block.begin.cerial', () => {
    const tokens = tokenizeLine(grammar, 'model User {');
    const brace = findToken(tokens, '{');
    assertScope(brace, 'punctuation.section.block.begin.cerial');
  });
});

// ===========================================================================
// 2. PRIMITIVE TYPES
// ===========================================================================

describe('Primitive Types', () => {
  const primitives = [
    'String',
    'Email',
    'Int',
    'Float',
    'Bool',
    'Date',
    'Number',
    'Record',
    'Relation',
    'Uuid',
    'Duration',
    'Decimal',
    'Bytes',
    'Geometry',
    'Any',
  ];

  for (const typeName of primitives) {
    it(`${typeName} → support.type.primitive.cerial`, async () => {
      // Tokenize inside a model block to get proper context
      const lines = await tokenizeFixtureLines(`model Test {\n  field ${typeName}\n}`);
      const fieldLine = lines[1];
      const typeTok = findToken(fieldLine.tokens, typeName);
      assertScope(typeTok, 'support.type.primitive.cerial');
    });
  }

  it('Record in Record(int) → support.type.primitive.cerial', async () => {
    const lines = await tokenizeFixtureLines('model Test {\n  id Record(int) @id\n}');
    const fieldLine = lines[1];
    const recordTok = findToken(fieldLine.tokens, 'Record');
    assertScope(recordTok, 'support.type.primitive.cerial');
  });

  it('int inside Record(int) → support.type.primitive.cerial', async () => {
    const lines = await tokenizeFixtureLines('model Test {\n  id Record(int) @id\n}');
    const fieldLine = lines[1];
    const intTok = findToken(fieldLine.tokens, 'int');
    assertScope(intTok, 'support.type.primitive.cerial');
  });

  it('uuid inside Record(uuid) → support.type.primitive.cerial', async () => {
    const lines = await tokenizeFixtureLines('model Test {\n  id Record(uuid) @id\n}');
    const fieldLine = lines[1];
    const uuidTok = findToken(fieldLine.tokens, 'uuid');
    assertScope(uuidTok, 'support.type.primitive.cerial');
  });

  it('string inside Record(string) → support.type.primitive.cerial', async () => {
    const lines = await tokenizeFixtureLines('model Test {\n  id Record(string) @id\n}');
    const fieldLine = lines[1];
    const stringTok = findToken(fieldLine.tokens, 'string');
    assertScope(stringTok, 'support.type.primitive.cerial');
  });
});

// Helper to tokenize inline multi-line source
async function tokenizeFixtureLines(source: string): Promise<LineTokens[]> {
  const { tokenizeSource } = await import('./helpers');
  const g = await getGrammar();

  return tokenizeSource(g, source);
}

// ===========================================================================
// 3. DECORATORS
// ===========================================================================

describe('Decorators', () => {
  describe('Simple decorators (no args)', () => {
    const simpleDecorators = [
      'id',
      'unique',
      'nullable',
      'now',
      'createdAt',
      'updatedAt',
      'readonly',
      'flexible',
      'set',
      'uuid',
      'uuid4',
      'uuid7',
      'point',
      'line',
      'polygon',
      'multipoint',
      'multiline',
      'multipolygon',
      'geoCollection',
    ];

    for (const dec of simpleDecorators) {
      it(`@${dec} → entity.name.function.decorator.cerial`, async () => {
        const lines = await tokenizeFixtureLines(`model T {\n  f String @${dec}\n}`);
        const fieldLine = lines[1];
        const decTok = findToken(fieldLine.tokens, dec);
        assertScope(decTok, 'entity.name.function.decorator.cerial');
      });
    }
  });

  describe('Decorators with arguments', () => {
    it('@default(true) — decorator name and boolean arg', async () => {
      const lines = await tokenizeFixtureLines('model T {\n  f Bool @default(true)\n}');
      const fieldLine = lines[1];
      const decTok = findToken(fieldLine.tokens, 'default');
      assertScope(decTok, 'entity.name.function.decorator.cerial');
      const boolTok = findToken(fieldLine.tokens, 'true');
      assertScope(boolTok, 'constant.language.boolean.cerial');
    });

    it("@default('user') — string argument", async () => {
      const lines = await tokenizeFixtureLines("model T {\n  f String @default('user')\n}");
      const fieldLine = lines[1];
      const decTok = findToken(fieldLine.tokens, 'default');
      assertScope(decTok, 'entity.name.function.decorator.cerial');
      // String content
      expect(hasScope(fieldLine.tokens, 'string.quoted.single.cerial')).toBe(true);
    });

    it('@default(0) — numeric argument', async () => {
      const lines = await tokenizeFixtureLines('model T {\n  f Int @default(0)\n}');
      const fieldLine = lines[1];
      const numTok = findToken(fieldLine.tokens, '0');
      assertScope(numTok, 'constant.numeric');
    });

    it('@default(3.5) — float argument', async () => {
      const lines = await tokenizeFixtureLines('model T {\n  f Float @default(3.5)\n}');
      const fieldLine = lines[1];
      const numTok = findToken(fieldLine.tokens, '3.5');
      assertScope(numTok, 'constant.numeric.float.cerial');
    });

    it('@default(null) — null argument', async () => {
      const lines = await tokenizeFixtureLines('model T {\n  f String? @nullable @default(null)\n}');
      const fieldLine = lines[1];
      // null is inside decorator args — it may be a variable.parameter or constant
      const nullTok = findToken(fieldLine.tokens, 'null');
      expect(nullTok).toBeDefined();
    });

    it('@defaultAlways(1) — decorator name', async () => {
      const lines = await tokenizeFixtureLines('model T {\n  f Int @defaultAlways(1)\n}');
      const fieldLine = lines[1];
      const decTok = findToken(fieldLine.tokens, 'defaultAlways');
      assertScope(decTok, 'entity.name.function.decorator.cerial');
    });

    it('@field(authorId) — variable parameter', async () => {
      const lines = await tokenizeFixtureLines('model T {\n  f Relation @field(authorId) @model(User)\n}');
      const fieldLine = lines[1];
      const fieldDec = findToken(fieldLine.tokens, 'field');
      assertScope(fieldDec, 'entity.name.function.decorator.cerial');
      const paramTok = findToken(fieldLine.tokens, 'authorId');
      assertScope(paramTok, 'variable.parameter.cerial');
    });

    it('@model(User) — variable parameter', async () => {
      const lines = await tokenizeFixtureLines('model T {\n  f Relation @field(fk) @model(User)\n}');
      const fieldLine = lines[1];
      const modelDec = findToken(fieldLine.tokens, 'model');
      assertScope(modelDec, 'entity.name.function.decorator.cerial');
      const paramTok = findToken(fieldLine.tokens, 'User');
      assertScope(paramTok, 'variable.parameter.cerial');
    });

    it('@onDelete(SetNone) — variable parameter', async () => {
      const lines = await tokenizeFixtureLines('model T {\n  f Relation? @field(fk) @model(X) @onDelete(SetNone)\n}');
      const fieldLine = lines[1];
      const decTok = findToken(fieldLine.tokens, 'onDelete');
      assertScope(decTok, 'entity.name.function.decorator.cerial');
      const paramTok = findToken(fieldLine.tokens, 'SetNone');
      assertScope(paramTok, 'variable.parameter.cerial');
    });

    it('@index — simple form', async () => {
      const lines = await tokenizeFixtureLines('model T {\n  f String @index\n}');
      const fieldLine = lines[1];
      const decTok = findToken(fieldLine.tokens, 'index');
      assertScope(decTok, 'entity.name.function.decorator.cerial');
    });
  });

  describe('Decorator punctuation', () => {
    it('@ sign → punctuation.definition.decorator.cerial', async () => {
      const lines = await tokenizeFixtureLines('model T {\n  f String @unique\n}');
      const fieldLine = lines[1];
      const atTok = findToken(fieldLine.tokens, '@');
      assertScope(atTok, 'punctuation.definition.decorator.cerial');
    });
  });
});

// ===========================================================================
// 4. COMMENTS
// ===========================================================================

describe('Comments', () => {
  it('// line comment → comment.line.double-slash.cerial', () => {
    const tokens = tokenizeLine(grammar, '// This is a comment');
    expect(hasScope(tokens, 'comment.line.double-slash.cerial')).toBe(true);
  });

  it('# hash comment → comment.line.number-sign.cerial', () => {
    const tokens = tokenizeLine(grammar, '# Hash comment');
    expect(hasScope(tokens, 'comment.line.number-sign.cerial')).toBe(true);
  });

  it('/* block comment */ → comment.block.cerial', async () => {
    const lines = await tokenizeFixtureLines('/* block comment */');
    expect(hasScope(lines[0].tokens, 'comment.block.cerial')).toBe(true);
  });

  it('multi-line block comment carries state', async () => {
    const lines = await tokenizeFixtureLines('/* start\n  middle\n  end */');
    // First line starts the block comment
    expect(hasScope(lines[0].tokens, 'comment.block.cerial')).toBe(true);
    // Middle line should still be in comment
    expect(hasScope(lines[1].tokens, 'comment.block.cerial')).toBe(true);
    // Last line should still be in comment
    expect(hasScope(lines[2].tokens, 'comment.block.cerial')).toBe(true);
  });

  it('inline comment after field', async () => {
    const lines = await tokenizeFixtureLines('model T {\n  f String // inline\n}');
    const fieldLine = lines[1];
    expect(hasScope(fieldLine.tokens, 'comment.line.double-slash.cerial')).toBe(true);
    // String type should still be recognized
    const typeTok = findToken(fieldLine.tokens, 'String');
    assertScope(typeTok, 'support.type.primitive.cerial');
  });
});

// ===========================================================================
// 5. STRINGS
// ===========================================================================

describe('Strings', () => {
  it('single-quoted string → string.quoted.single.cerial', async () => {
    const lines = await tokenizeFixtureLines("model T {\n  f String @default('hello')\n}");
    const fieldLine = lines[1];
    expect(hasScope(fieldLine.tokens, 'string.quoted.single.cerial')).toBe(true);
  });

  it('string punctuation begin/end', async () => {
    const lines = await tokenizeFixtureLines("model T {\n  f String @default('val')\n}");
    const fieldLine = lines[1];
    const beginQuote = fieldLine.tokens.find(
      (t) => t.text === "'" && t.scopes.some((s) => s.includes('punctuation.definition.string.begin')),
    );
    expect(beginQuote).toBeDefined();
  });

  it('escaped characters in strings', async () => {
    const lines = await tokenizeFixtureLines("model T {\n  f String @default('it\\'s')\n}");
    const fieldLine = lines[1];
    expect(hasScope(fieldLine.tokens, 'constant.character.escape.cerial')).toBe(true);
  });

  it('string inside literal block', async () => {
    const lines = await tokenizeFixtureLines("literal L {\n  'foo',\n  'bar'\n}");
    expect(hasScope(lines[1].tokens, 'string.quoted.single.cerial')).toBe(true);
    expect(hasScope(lines[2].tokens, 'string.quoted.single.cerial')).toBe(true);
  });
});

// ===========================================================================
// 6. NUMBERS
// ===========================================================================

describe('Numbers', () => {
  it('integer → constant.numeric.integer.cerial', async () => {
    const lines = await tokenizeFixtureLines('model T {\n  f Int @default(42)\n}');
    const fieldLine = lines[1];
    const numTok = findToken(fieldLine.tokens, '42');
    assertScope(numTok, 'constant.numeric.integer.cerial');
  });

  it('float → constant.numeric.float.cerial', async () => {
    const lines = await tokenizeFixtureLines('model T {\n  f Float @default(3.14)\n}');
    const fieldLine = lines[1];
    const numTok = findToken(fieldLine.tokens, '3.14');
    assertScope(numTok, 'constant.numeric.float.cerial');
  });

  it('zero → constant.numeric', async () => {
    const lines = await tokenizeFixtureLines('model T {\n  f Int @default(0)\n}');
    const fieldLine = lines[1];
    const numTok = findToken(fieldLine.tokens, '0');
    assertScope(numTok, 'constant.numeric');
  });

  it('number inside literal block', async () => {
    const lines = await tokenizeFixtureLines('literal S { 1, 2, 3 }');
    const numToks = tokensWithScope(lines[0].tokens, 'constant.numeric');
    expect(numToks.length).toBeGreaterThanOrEqual(3);
  });
});

// ===========================================================================
// 7. BOOLEANS
// ===========================================================================

describe('Booleans', () => {
  it('true → constant.language.boolean.cerial', async () => {
    const lines = await tokenizeFixtureLines('model T {\n  f Bool @default(true)\n}');
    const fieldLine = lines[1];
    const boolTok = findToken(fieldLine.tokens, 'true');
    assertScope(boolTok, 'constant.language.boolean.cerial');
  });

  it('false → constant.language.boolean.cerial', async () => {
    const lines = await tokenizeFixtureLines('model T {\n  f Bool @default(false)\n}');
    const fieldLine = lines[1];
    const boolTok = findToken(fieldLine.tokens, 'false');
    assertScope(boolTok, 'constant.language.boolean.cerial');
  });

  it('boolean in literal block', async () => {
    const lines = await tokenizeFixtureLines("literal B { true, false, 'x' }");
    expect(hasScope(lines[0].tokens, 'constant.language.boolean.cerial')).toBe(true);
  });
});

// ===========================================================================
// 8. EXTENDS KEYWORD
// ===========================================================================

describe('Extends', () => {
  it('extends in model → keyword.control.extends.cerial', () => {
    const tokens = tokenizeLine(grammar, 'model Customer extends BaseUser {');
    const extTok = findToken(tokens, 'extends');
    assertScope(extTok, 'keyword.control.extends.cerial');
  });

  it('parent name after extends → entity.name.type.model.cerial', () => {
    const tokens = tokenizeLine(grammar, 'model Customer extends BaseUser {');
    const parentTok = findToken(tokens, 'BaseUser');
    assertScope(parentTok, 'entity.name.type.model.cerial');
  });

  it('extends in object → keyword.control.extends.cerial', () => {
    const tokens = tokenizeLine(grammar, 'object FullAddress extends BaseAddress {');
    const extTok = findToken(tokens, 'extends');
    assertScope(extTok, 'keyword.control.extends.cerial');
  });

  it('extends in tuple → keyword.control.extends.cerial', () => {
    const tokens = tokenizeLine(grammar, 'tuple ExtendedPair extends BasePair {');
    const extTok = findToken(tokens, 'extends');
    assertScope(extTok, 'keyword.control.extends.cerial');
  });

  it('extends in enum → keyword.control.extends.cerial', () => {
    const tokens = tokenizeLine(grammar, 'enum ExtendedRole extends BaseRole { ADMIN }');
    const extTok = findToken(tokens, 'extends');
    assertScope(extTok, 'keyword.control.extends.cerial');
  });

  it('extends in literal → keyword.control.extends.cerial', () => {
    const tokens = tokenizeLine(grammar, "literal ExtendedStatus extends BaseStatus { 'archived' }");
    const extTok = findToken(tokens, 'extends');
    assertScope(extTok, 'keyword.control.extends.cerial');
  });

  it('extends with pick list — brackets and field names', () => {
    const tokens = tokenizeLine(grammar, 'model AuditEntry extends BaseEntity[id, createdAt] {');
    const extTok = findToken(tokens, 'extends');
    assertScope(extTok, 'keyword.control.extends.cerial');
    // Brackets
    expect(
      tokens.some((t) => t.text.includes('[') || t.scopes.some((s) => s.includes('punctuation.section.brackets'))),
    ).toBe(true);
  });

  it('extends with omit — ! operator', () => {
    const tokens = tokenizeLine(grammar, 'model ServiceAccount extends BaseUser[!active] {');
    const extTok = findToken(tokens, 'extends');
    assertScope(extTok, 'keyword.control.extends.cerial');
  });
});

// ===========================================================================
// 9. ABSTRACT MODIFIER
// ===========================================================================

describe('Abstract', () => {
  it('abstract keyword → storage.modifier.abstract.cerial', () => {
    const tokens = tokenizeLine(grammar, 'abstract model BaseEntity {');
    const abstractTok = findToken(tokens, 'abstract');
    assertScope(abstractTok, 'storage.modifier.abstract.cerial');
  });

  it('abstract model still has model name scoped', () => {
    const tokens = tokenizeLine(grammar, 'abstract model BaseEntity {');
    const nameTok = findToken(tokens, 'BaseEntity');
    assertScope(nameTok, 'entity.name.type.model.cerial');
  });
});

// ===========================================================================
// 10. !!PRIVATE MODIFIER
// ===========================================================================

describe('!!private', () => {
  it('!!private → storage.modifier.private.cerial', async () => {
    const lines = await tokenizeFixtureLines('model T {\n  id Record @id !!private\n}');
    const fieldLine = lines[1];
    const privateTok = findToken(fieldLine.tokens, '!!private');
    assertScope(privateTok, 'storage.modifier.private.cerial');
  });
});

// ===========================================================================
// 11. COMPOSITE DIRECTIVES (@@index, @@unique)
// ===========================================================================

describe('Composite Directives', () => {
  it('@@unique — directive name → entity.name.function.directive.cerial', async () => {
    const lines = await tokenizeFixtureLines('model T {\n  f String\n  @@unique(emailSlug, [email, slug])\n}');
    const directiveLine = lines[2];
    const directiveTok = findToken(directiveLine.tokens, 'unique');
    assertScope(directiveTok, 'entity.name.function.directive.cerial');
  });

  it('@@index — directive name → entity.name.function.directive.cerial', async () => {
    const lines = await tokenizeFixtureLines('model T {\n  f String\n  @@index(catRole, [category, role])\n}');
    const directiveLine = lines[2];
    const directiveTok = findToken(directiveLine.tokens, 'index');
    assertScope(directiveTok, 'entity.name.function.directive.cerial');
  });

  it('@@ punctuation → punctuation.definition.decorator.cerial', async () => {
    const lines = await tokenizeFixtureLines('model T {\n  f String\n  @@unique(a, [b])\n}');
    const directiveLine = lines[2];
    const atAtTok = findToken(directiveLine.tokens, '@@');
    assertScope(atAtTok, 'punctuation.definition.decorator.cerial');
  });

  it('field names in directive brackets → variable.other.field.cerial', async () => {
    const lines = await tokenizeFixtureLines('model T {\n  f String\n  @@unique(emailSlug, [email, slug])\n}');
    const directiveLine = lines[2];
    const fieldToks = tokensWithScope(directiveLine.tokens, 'variable.other.field.cerial');
    const fieldNames = fieldToks.map((t) => t.text);
    expect(fieldNames).toContain('email');
    expect(fieldNames).toContain('slug');
  });
});

// ===========================================================================
// 12. RECORD() PARAMETERIZATION
// ===========================================================================

describe('Record() Parameterization', () => {
  it('Record(int) — Record is primitive type, int is primitive inside parens', async () => {
    const lines = await tokenizeFixtureLines('model T {\n  id Record(int) @id\n}');
    const fieldLine = lines[1];
    const recordTok = findToken(fieldLine.tokens, 'Record');
    assertScope(recordTok, 'support.type.primitive.cerial');
    const intTok = findToken(fieldLine.tokens, 'int');
    assertScope(intTok, 'support.type.primitive.cerial');
  });

  it('Record(float) — float parameter', async () => {
    const lines = await tokenizeFixtureLines('model T {\n  id Record(float) @id\n}');
    const fieldLine = lines[1];
    const floatTok = findToken(fieldLine.tokens, 'float');
    assertScope(floatTok, 'support.type.primitive.cerial');
  });

  it('Record(number) — number parameter', async () => {
    const lines = await tokenizeFixtureLines('model T {\n  id Record(number) @id\n}');
    const fieldLine = lines[1];
    const numberTok = findToken(fieldLine.tokens, 'number');
    assertScope(numberTok, 'support.type.primitive.cerial');
  });

  it('Record() parentheses → punctuation.section.group', async () => {
    const lines = await tokenizeFixtureLines('model T {\n  id Record(int) @id\n}');
    const fieldLine = lines[1];
    const openParen = findToken(fieldLine.tokens, '(');
    assertScope(openParen, 'punctuation.section.group.begin.cerial');
    const closeParen = findToken(fieldLine.tokens, ')');
    assertScope(closeParen, 'punctuation.section.group.end.cerial');
  });

  it('Record(TypeName) — type reference inside parens', async () => {
    const lines = await tokenizeFixtureLines('model T {\n  id Record(MyTuple) @id\n}');
    const fieldLine = lines[1];
    const typeTok = findToken(fieldLine.tokens, 'MyTuple');
    assertScope(typeTok, 'entity.name.type.cerial');
  });

  it('Record(string, int) — multiple params with comma', async () => {
    const lines = await tokenizeFixtureLines('model T {\n  id Record(string, int) @id\n}');
    const fieldLine = lines[1];
    const stringTok = findToken(fieldLine.tokens, 'string');
    assertScope(stringTok, 'support.type.primitive.cerial');
    const intTok = findToken(fieldLine.tokens, 'int');
    assertScope(intTok, 'support.type.primitive.cerial');
    const commaTok = findToken(fieldLine.tokens, ',');
    assertScope(commaTok, 'punctuation.separator.comma.cerial');
  });
});

// ===========================================================================
// 13. FIELD NAMES
// ===========================================================================

describe('Field Names', () => {
  it('field name at start of line → variable.other.field.cerial', async () => {
    const lines = await tokenizeFixtureLines('model T {\n  name String\n}');
    const fieldLine = lines[1];
    const nameTok = findToken(fieldLine.tokens, 'name');
    assertScope(nameTok, 'variable.other.field.cerial');
  });

  it('camelCase field name', async () => {
    const lines = await tokenizeFixtureLines('model T {\n  createdAt Date\n}');
    const fieldLine = lines[1];
    const fieldTok = findToken(fieldLine.tokens, 'createdAt');
    assertScope(fieldTok, 'variable.other.field.cerial');
  });

  it('underscore-prefixed field name', async () => {
    const lines = await tokenizeFixtureLines('model T {\n  _internal String\n}');
    const fieldLine = lines[1];
    const fieldTok = findToken(fieldLine.tokens, '_internal');
    assertScope(fieldTok, 'variable.other.field.cerial');
  });
});

// ===========================================================================
// 14. OPTIONAL MODIFIER
// ===========================================================================

describe('Optional Modifier', () => {
  it('? → keyword.operator.optional.cerial', async () => {
    const lines = await tokenizeFixtureLines('model T {\n  age Int?\n}');
    const fieldLine = lines[1];
    const optTok = findToken(fieldLine.tokens, '?');
    assertScope(optTok, 'keyword.operator.optional.cerial');
  });
});

// ===========================================================================
// 15. ARRAY MODIFIER
// ===========================================================================

describe('Array Modifier', () => {
  it('[] → keyword.operator.array.cerial', async () => {
    const lines = await tokenizeFixtureLines('model T {\n  tags String[]\n}');
    const fieldLine = lines[1];
    const arrTok = findToken(fieldLine.tokens, '[]');
    assertScope(arrTok, 'keyword.operator.array.cerial');
  });
});

// ===========================================================================
// 16. TYPE REFERENCES
// ===========================================================================

describe('Type References', () => {
  it('custom type reference → entity.name.type.cerial', async () => {
    const lines = await tokenizeFixtureLines('model T {\n  address Address\n}');
    const fieldLine = lines[1];
    const typeTok = findToken(fieldLine.tokens, 'Address');
    assertScope(typeTok, 'entity.name.type.cerial');
  });

  it('type reference in tuple', async () => {
    const lines = await tokenizeFixtureLines('tuple T {\n  Coordinate\n}');
    const bodyLine = lines[1];
    // Inside tuple block, Coordinate should be recognized
    expect(
      hasScope(bodyLine.tokens, 'entity.name.type.cerial') ||
        hasScope(bodyLine.tokens, 'support.type.primitive.cerial'),
    ).toBe(true);
  });
});

// ===========================================================================
// 17. ENUM MEMBERS
// ===========================================================================

describe('Enum Members', () => {
  it('enum members → variable.other.enummember.cerial', async () => {
    const lines = await tokenizeFixtureLines('enum Status {\n  ACTIVE\n  INACTIVE\n}');
    const memberLine = lines[1];
    const memberTok = findToken(memberLine.tokens, 'ACTIVE');
    assertScope(memberTok, 'variable.other.enummember.cerial');
  });

  it('inline enum members', () => {
    const tokens = tokenizeLine(grammar, 'enum Priority { LOW, MEDIUM, HIGH, CRITICAL }');
    // Inside the enum block, members should be enummember
    const lowTok = findToken(tokens, 'LOW');
    // LOW might be inside the block scope
    expect(lowTok).toBeDefined();
  });
});

// ===========================================================================
// 18. NULL LITERAL
// ===========================================================================

describe('Null Literal', () => {
  it('null in @default(null) → recognized', async () => {
    const lines = await tokenizeFixtureLines('model T {\n  f Date? @nullable @default(null)\n}');
    const fieldLine = lines[1];
    const nullTok = findToken(fieldLine.tokens, 'null');
    // Inside decorator args, null may be variable.parameter or constant.language.null
    expect(nullTok).toBeDefined();
  });
});

// ===========================================================================
// 19. COMMA SEPARATOR
// ===========================================================================

describe('Comma Separator', () => {
  it('comma in tuple → punctuation.separator.comma.cerial', async () => {
    const lines = await tokenizeFixtureLines('tuple P {\n  x Float,\n  y Float\n}');
    const fieldLine = lines[1];
    const commaTok = findToken(fieldLine.tokens, ',');
    assertScope(commaTok, 'punctuation.separator.comma.cerial');
  });

  it('comma in enum', () => {
    const tokens = tokenizeLine(grammar, 'enum S { A, B, C }');
    const commas = tokens.filter((t) => t.text === ',');
    expect(commas.length).toBeGreaterThanOrEqual(1);
  });
});

// ===========================================================================
// 20. FIXTURE FILE INTEGRATION TESTS
// ===========================================================================

describe('Fixture: simple-model.cerial', () => {
  let lines: LineTokens[];

  beforeAll(async () => {
    lines = await tokenizeFixture('simple-model.cerial');
  });

  it('hash comment on line 1', () => {
    expect(hasScope(lines[0].tokens, 'comment.line.number-sign.cerial')).toBe(true);
  });

  it('model User keyword on line 3', () => {
    const modelTok = findToken(lines[2].tokens, 'model');
    assertScope(modelTok, 'storage.type.model.cerial');
  });

  it('Email type recognized', () => {
    // Line 5: email Email @unique
    const emailTypeTok = findToken(lines[4].tokens, 'Email');
    assertScope(emailTypeTok, 'support.type.primitive.cerial');
  });

  it('optional marker on age field', () => {
    // Line 7: age Int?
    const optTok = findToken(lines[6].tokens, '?');
    assertScope(optTok, 'keyword.operator.optional.cerial');
  });

  it('array modifier on tags field', () => {
    // Line 12: tags String[]
    const arrTok = findToken(lines[11].tokens, '[]');
    assertScope(arrTok, 'keyword.operator.array.cerial');
  });

  it('second model Article recognized', () => {
    // Line 17: model Article {
    const modelTok = findToken(lines[16].tokens, 'model');
    assertScope(modelTok, 'storage.type.model.cerial');
    const nameTok = findToken(lines[16].tokens, 'Article');
    assertScope(nameTok, 'entity.name.type.model.cerial');
  });
});

describe('Fixture: decorators.cerial', () => {
  let lines: LineTokens[];

  beforeAll(async () => {
    lines = await tokenizeFixture('decorators.cerial');
  });

  it('// comment on line 1', () => {
    expect(hasScope(lines[0].tokens, 'comment.line.double-slash.cerial')).toBe(true);
  });

  it('object FlexMeta recognized', () => {
    // Line 3: object FlexMeta {
    const objectTok = findToken(lines[2].tokens, 'object');
    assertScope(objectTok, 'storage.type.object.cerial');
  });

  it('@unique decorator', () => {
    // Line 12: email Email @unique
    const decTok = findToken(lines[11].tokens, 'unique');
    assertScope(decTok, 'entity.name.function.decorator.cerial');
  });

  it("@default('user') with string arg", () => {
    // Line 16: role String @default('user')
    const decTok = findToken(lines[15].tokens, 'default');
    assertScope(decTok, 'entity.name.function.decorator.cerial');
    expect(hasScope(lines[15].tokens, 'string.quoted.single.cerial')).toBe(true);
  });

  it('@createdAt timestamp decorator', () => {
    // Line 32: createdAt Date @createdAt
    const decTok = findToken(lines[31].tokens, 'createdAt');
    // There are two 'createdAt' tokens — the field name and the decorator
    // We want the decorator one
    const decoratorTokens = lines[31].tokens.filter(
      (t) => t.text === 'createdAt' && t.scopes.some((s) => s.includes('entity.name.function.decorator')),
    );
    expect(decoratorTokens.length).toBeGreaterThanOrEqual(1);
  });

  it('@uuid decorator on Uuid field', () => {
    // Line 37: trackingId Uuid @uuid
    const decTok = lines[36].tokens.find(
      (t) => t.text === 'uuid' && t.scopes.some((s) => s.includes('entity.name.function.decorator')),
    );
    expect(decTok).toBeDefined();
  });

  it('@uuid4 and @uuid7 decorators', () => {
    // Line 38: legacyUuid Uuid @uuid4
    const uuid4Tok = lines[37].tokens.find(
      (t) => t.text === 'uuid4' && t.scopes.some((s) => s.includes('entity.name.function.decorator')),
    );
    expect(uuid4Tok).toBeDefined();

    // Line 39: modernUuid Uuid @uuid7
    const uuid7Tok = lines[38].tokens.find(
      (t) => t.text === 'uuid7' && t.scopes.some((s) => s.includes('entity.name.function.decorator')),
    );
    expect(uuid7Tok).toBeDefined();
  });

  it('@set decorator on array field', () => {
    // Line 42: tags String[] @set
    const setTok = lines[41].tokens.find(
      (t) => t.text === 'set' && t.scopes.some((s) => s.includes('entity.name.function.decorator')),
    );
    expect(setTok).toBeDefined();
  });

  it('@flexible decorator', () => {
    // Line 45: metadata FlexMeta @flexible
    const flexTok = lines[44].tokens.find(
      (t) => t.text === 'flexible' && t.scopes.some((s) => s.includes('entity.name.function.decorator')),
    );
    expect(flexTok).toBeDefined();
  });

  it('geometry decorators (@point, @polygon, etc.)', () => {
    // Line 48: location Geometry @point
    const pointTok = lines[47].tokens.find(
      (t) => t.text === 'point' && t.scopes.some((s) => s.includes('entity.name.function.decorator')),
    );
    expect(pointTok).toBeDefined();

    // Line 49: boundary Geometry @polygon
    const polygonTok = lines[48].tokens.find(
      (t) => t.text === 'polygon' && t.scopes.some((s) => s.includes('entity.name.function.decorator')),
    );
    expect(polygonTok).toBeDefined();
  });

  it('@@unique composite directive', () => {
    // Line 64: @@unique(emailSlug, [email, slug])
    const directiveTok = lines[63].tokens.find(
      (t) => t.text === 'unique' && t.scopes.some((s) => s.includes('entity.name.function.directive')),
    );
    expect(directiveTok).toBeDefined();
  });

  it('@@index composite directive', () => {
    // Line 65: @@index(categoryRole, [category, role])
    const directiveTok = lines[64].tokens.find(
      (t) => t.text === 'index' && t.scopes.some((s) => s.includes('entity.name.function.directive')),
    );
    expect(directiveTok).toBeDefined();
  });

  it('Record(int) typed ID', () => {
    // Line 70: id Record(int) @id
    const recordTok = findToken(lines[69].tokens, 'Record');
    assertScope(recordTok, 'support.type.primitive.cerial');
    const intTok = findToken(lines[69].tokens, 'int');
    assertScope(intTok, 'support.type.primitive.cerial');
  });
});

describe('Fixture: relations.cerial', () => {
  let lines: LineTokens[];

  beforeAll(async () => {
    lines = await tokenizeFixture('relations.cerial');
  });

  it('Relation type recognized', () => {
    // Line 11: profile Relation? @field(profileId) @model(AuthorProfile) @onDelete(SetNone)
    const relTok = findToken(lines[10].tokens, 'Relation');
    assertScope(relTok, 'support.type.primitive.cerial');
  });

  it('@field decorator with arg', () => {
    const fieldDec = lines[10].tokens.find(
      (t) => t.text === 'field' && t.scopes.some((s) => s.includes('entity.name.function.decorator')),
    );
    expect(fieldDec).toBeDefined();
  });

  it('@model decorator with arg', () => {
    const modelDec = lines[10].tokens.find(
      (t) => t.text === 'model' && t.scopes.some((s) => s.includes('entity.name.function.decorator')),
    );
    expect(modelDec).toBeDefined();
  });

  it('@onDelete decorator with arg', () => {
    const onDeleteDec = lines[10].tokens.find(
      (t) => t.text === 'onDelete' && t.scopes.some((s) => s.includes('entity.name.function.decorator')),
    );
    expect(onDeleteDec).toBeDefined();
  });

  it('Relation[] array', () => {
    // Line 14: books Relation[] @model(Book)
    const relTok = findToken(lines[13].tokens, 'Relation');
    assertScope(relTok, 'support.type.primitive.cerial');
    const arrTok = findToken(lines[13].tokens, '[]');
    assertScope(arrTok, 'keyword.operator.array.cerial');
  });

  it('Record[] for N:N FK', () => {
    // Line 43: tagIds Record[]
    const recTok = findToken(lines[42].tokens, 'Record');
    assertScope(recTok, 'support.type.primitive.cerial');
  });
});

describe('Fixture: complex-types.cerial', () => {
  let lines: LineTokens[];

  beforeAll(async () => {
    lines = await tokenizeFixture('complex-types.cerial');
  });

  it('object block recognized', () => {
    // Line 3: object Address {
    const objectTok = findToken(lines[2].tokens, 'object');
    assertScope(objectTok, 'storage.type.object.cerial');
  });

  it('tuple block recognized', () => {
    // Line 15: tuple Point3D {
    const tupleTok = findToken(lines[14].tokens, 'tuple');
    assertScope(tupleTok, 'storage.type.tuple.cerial');
  });

  it('enum inline', () => {
    // Line 32: enum Status { ACTIVE, INACTIVE, PENDING, ARCHIVED }
    const enumTok = findToken(lines[31].tokens, 'enum');
    assertScope(enumTok, 'storage.type.enum.cerial');
  });

  it('literal block with numbers', () => {
    // Line 36: literal Severity { 1, 2, 3, 4, 5 }
    const litTok = findToken(lines[35].tokens, 'literal');
    assertScope(litTok, 'storage.type.literal.cerial');
    const numToks = tokensWithScope(lines[35].tokens, 'constant.numeric');
    expect(numToks.length).toBeGreaterThanOrEqual(5);
  });

  it('literal with mixed types (strings, numbers, booleans)', () => {
    // Line 38: literal MixedTag { 'info', 'warn', 'error', 1, 2, true }
    expect(hasScope(lines[37].tokens, 'string.quoted.single.cerial')).toBe(true);
    expect(hasScope(lines[37].tokens, 'constant.numeric')).toBe(true);
    expect(hasScope(lines[37].tokens, 'constant.language.boolean.cerial')).toBe(true);
  });

  it('block comment before literal', () => {
    // Line 40: /* Literal referencing an enum */
    expect(hasScope(lines[39].tokens, 'comment.block.cerial')).toBe(true);
  });

  it('type references in model fields', () => {
    // Line 46: address Address
    const typeTok = findToken(lines[45].tokens, 'Address');
    assertScope(typeTok, 'entity.name.type.cerial');
  });
});

describe('Fixture: inheritance.cerial', () => {
  let lines: LineTokens[];

  beforeAll(async () => {
    lines = await tokenizeFixture('inheritance.cerial');
  });

  it('abstract model BaseEntity', () => {
    // Line 3: abstract model BaseEntity {
    const abstractTok = findToken(lines[2].tokens, 'abstract');
    assertScope(abstractTok, 'storage.modifier.abstract.cerial');
    const modelTok = findToken(lines[2].tokens, 'model');
    assertScope(modelTok, 'storage.type.model.cerial');
    const nameTok = findToken(lines[2].tokens, 'BaseEntity');
    assertScope(nameTok, 'entity.name.type.model.cerial');
  });

  it('!!private modifier on field', () => {
    // Line 4: id Record @id !!private
    const privateTok = findToken(lines[3].tokens, '!!private');
    assertScope(privateTok, 'storage.modifier.private.cerial');
  });

  it('abstract model extends abstract model', () => {
    // Line 9: abstract model BaseUser extends BaseEntity {
    const abstractTok = findToken(lines[8].tokens, 'abstract');
    assertScope(abstractTok, 'storage.modifier.abstract.cerial');
    const extTok = findToken(lines[8].tokens, 'extends');
    assertScope(extTok, 'keyword.control.extends.cerial');
  });

  it('model extends with omit [!active]', () => {
    // Line 22: model ServiceAccount extends BaseUser[!active] {
    const extTok = findToken(lines[21].tokens, 'extends');
    assertScope(extTok, 'keyword.control.extends.cerial');
  });

  it('model extends with pick [id, createdAt]', () => {
    // Line 28: model AuditEntry extends BaseEntity[id, createdAt] {
    const extTok = findToken(lines[27].tokens, 'extends');
    assertScope(extTok, 'keyword.control.extends.cerial');
  });

  it('object inheritance', () => {
    // Line 49: object FullAddress extends BaseAddress {
    const objectTok = findToken(lines[48].tokens, 'object');
    assertScope(objectTok, 'storage.type.object.cerial');
    const extTok = findToken(lines[48].tokens, 'extends');
    assertScope(extTok, 'keyword.control.extends.cerial');
  });

  it('tuple inheritance', () => {
    // Line 61: tuple ExtendedPair extends BasePair {
    const tupleTok = findToken(lines[60].tokens, 'tuple');
    assertScope(tupleTok, 'storage.type.tuple.cerial');
    const extTok = findToken(lines[60].tokens, 'extends');
    assertScope(extTok, 'keyword.control.extends.cerial');
  });

  it('enum inheritance', () => {
    // Line 68: enum ExtendedRole extends BaseRole { ADMIN, SUPERADMIN }
    const enumTok = findToken(lines[67].tokens, 'enum');
    assertScope(enumTok, 'storage.type.enum.cerial');
    const extTok = findToken(lines[67].tokens, 'extends');
    assertScope(extTok, 'keyword.control.extends.cerial');
  });

  it('literal inheritance', () => {
    // Line 73: literal ExtendedStatus extends BaseStatus { 'archived', 'deleted' }
    const litTok = findToken(lines[72].tokens, 'literal');
    assertScope(litTok, 'storage.type.literal.cerial');
    const extTok = findToken(lines[72].tokens, 'extends');
    assertScope(extTok, 'keyword.control.extends.cerial');
  });
});

describe('Fixture: multi-file-a.cerial', () => {
  let lines: LineTokens[];

  beforeAll(async () => {
    lines = await tokenizeFixture('multi-file-a.cerial');
  });

  it('hash comment', () => {
    expect(hasScope(lines[0].tokens, 'comment.line.number-sign.cerial')).toBe(true);
  });

  it('inline enum', () => {
    // Line 3: enum Department { ENGINEERING, MARKETING, SALES, SUPPORT }
    const enumTok = findToken(lines[2].tokens, 'enum');
    assertScope(enumTok, 'storage.type.enum.cerial');
  });

  it('self-referential relation', () => {
    // Line 16: manager Relation? @field(managerId) @model(Employee)
    const relTok = findToken(lines[15].tokens, 'Relation');
    assertScope(relTok, 'support.type.primitive.cerial');
  });
});

describe('Fixture: multi-file-b.cerial', () => {
  let lines: LineTokens[];

  beforeAll(async () => {
    lines = await tokenizeFixture('multi-file-b.cerial');
  });

  it('literal block', () => {
    // Line 3: literal ProjectStatus { 'planning', 'active', 'paused', 'completed' }
    const litTok = findToken(lines[2].tokens, 'literal');
    assertScope(litTok, 'storage.type.literal.cerial');
    expect(hasScope(lines[2].tokens, 'string.quoted.single.cerial')).toBe(true);
  });

  it('tuple block with named elements', () => {
    // Line 5: tuple Budget {
    const tupleTok = findToken(lines[4].tokens, 'tuple');
    assertScope(tupleTok, 'storage.type.tuple.cerial');
  });
});

describe('Fixture: errors.cerial (error resilience)', () => {
  let lines: LineTokens[];

  beforeAll(async () => {
    lines = await tokenizeFixture('errors.cerial');
  });

  it('model keyword still recognized despite bad field types', () => {
    // Line 4: model BadTypes {
    const modelTok = findToken(lines[3].tokens, 'model');
    assertScope(modelTok, 'storage.type.model.cerial');
  });

  it('unknown types still get generic type scope', () => {
    // Line 6: name Strig — misspelled, but starts with uppercase → entity.name.type.cerial
    const typeTok = findToken(lines[5].tokens, 'Strig');
    assertScope(typeTok, 'entity.name.type.cerial');
  });

  it('Record @id still recognized', () => {
    // Line 5: id Record @id
    const recTok = findToken(lines[4].tokens, 'Record');
    assertScope(recTok, 'support.type.primitive.cerial');
    const idDec = lines[4].tokens.find(
      (t) => t.text === 'id' && t.scopes.some((s) => s.includes('entity.name.function.decorator')),
    );
    expect(idDec).toBeDefined();
  });

  it('Date type on lines with invalid decorator combos', () => {
    // Line 22: ts1 Date @createdAt @updatedAt
    const dateTok = findToken(lines[21].tokens, 'Date');
    assertScope(dateTok, 'support.type.primitive.cerial');
  });

  it('Any type recognized', () => {
    // Line 25: anyOpt Any?
    const anyTok = findToken(lines[24].tokens, 'Any');
    assertScope(anyTok, 'support.type.primitive.cerial');
  });
});

describe('Fixture: incomplete.cerial (parser resilience)', () => {
  let lines: LineTokens[];

  beforeAll(async () => {
    lines = await tokenizeFixture('incomplete.cerial');
  });

  it('model keyword on unclosed block', () => {
    // Line 4: model PartialUser {
    const modelTok = findToken(lines[3].tokens, 'model');
    assertScope(modelTok, 'storage.type.model.cerial');
  });

  it('empty model block — inside unclosed prior block, keyword is re-scoped', () => {
    // Line 32: model EmptyModel {
    // Because prior blocks are unclosed, the ruleStack carries forward.
    // 'model' here is inside the unclosed model block, so it won't get storage.type.model scope.
    // This is correct TextMate behavior — unclosed blocks affect subsequent tokenization.
    const modelTok = findToken(lines[31].tokens, 'model');
    expect(modelTok).toBeDefined();
    // It's inside meta.block.model.cerial from the unclosed parent
    expect(modelTok!.scopes.some((s) => s.includes('meta.block.model.cerial'))).toBe(true);
  });

  it('empty enum block — inside unclosed prior block, keyword is re-scoped', () => {
    // Line 35: enum EmptyEnum {
    // Same as above — unclosed blocks prevent proper re-scoping
    const enumTok = findToken(lines[34].tokens, 'enum');
    expect(enumTok).toBeDefined();
    expect(enumTok!.scopes.some((s) => s.includes('meta.block.model.cerial'))).toBe(true);
  });
});

// ===========================================================================
// 21. SCOPE COVERAGE SUMMARY
// ===========================================================================

describe('Scope Coverage', () => {
  it('all expected scope categories are exercised across fixtures', async () => {
    const allFixtures = [
      'simple-model.cerial',
      'decorators.cerial',
      'relations.cerial',
      'complex-types.cerial',
      'inheritance.cerial',
      'multi-file-a.cerial',
      'multi-file-b.cerial',
      'errors.cerial',
      'incomplete.cerial',
    ];

    const allScopes = new Set<string>();
    for (const fixture of allFixtures) {
      const lines = await tokenizeFixture(fixture);
      for (const { tokens } of lines) {
        for (const token of tokens) {
          for (const scope of token.scopes) {
            allScopes.add(scope);
          }
        }
      }
    }

    // Verify critical scope categories are present
    const requiredScopeFragments = [
      'storage.type.model.cerial',
      'storage.type.object.cerial',
      'storage.type.tuple.cerial',
      'storage.type.enum.cerial',
      'storage.type.literal.cerial',
      'storage.modifier.abstract.cerial',
      'storage.modifier.private.cerial',
      'entity.name.type.model.cerial',
      'entity.name.type.object.cerial',
      'entity.name.type.tuple.cerial',
      'entity.name.type.enum.cerial',
      'entity.name.type.literal.cerial',
      'entity.name.type.cerial',
      'entity.name.function.decorator.cerial',
      'entity.name.function.directive.cerial',
      'support.type.primitive.cerial',
      'variable.other.field.cerial',
      'variable.other.enummember.cerial',
      'variable.parameter.cerial',
      'keyword.control.extends.cerial',
      'keyword.operator.optional.cerial',
      'keyword.operator.array.cerial',
      'comment.line.double-slash.cerial',
      'comment.line.number-sign.cerial',
      'comment.block.cerial',
      'string.quoted.single.cerial',
      'constant.numeric.integer.cerial',
      'constant.numeric.float.cerial',
      'constant.language.boolean.cerial',
      'punctuation.definition.decorator.cerial',
      'punctuation.separator.comma.cerial',
      'punctuation.section.block.begin.cerial',
      'punctuation.section.block.end.cerial',
      'punctuation.section.group.begin.cerial',
      'punctuation.section.group.end.cerial',
      'meta.block.model.cerial',
      'meta.block.object.cerial',
      'meta.block.tuple.cerial',
      'meta.block.enum.cerial',
      'meta.block.literal.cerial',
    ];

    const missingScopes: string[] = [];
    for (const fragment of requiredScopeFragments) {
      const found = [...allScopes].some((s) => s.includes(fragment));
      if (!found) {
        missingScopes.push(fragment);
      }
    }

    if (missingScopes.length > 0) {
      throw new Error(`Missing scope categories in fixtures:\n${missingScopes.map((s) => `  - ${s}`).join('\n')}`);
    }
  });
});
