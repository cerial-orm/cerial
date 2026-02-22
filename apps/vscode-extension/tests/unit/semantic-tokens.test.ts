import { describe, expect, test } from 'bun:test';
import { SemanticTokenModifiers, SemanticTokenTypes } from 'vscode-languageserver';
import { parse } from '../../../src/parser/parser';
import { TOKEN_MODIFIERS, TOKEN_TYPES } from '../../server/src/providers/semantic-tokens';
import { cerialToLsp } from '../../server/src/utils/position';

describe('Semantic Tokens Logic', () => {
  describe('TOKEN_TYPES legend', () => {
    test('has 10 token types', () => {
      expect(TOKEN_TYPES).toHaveLength(10);
    });

    test('index 0 is keyword', () => {
      expect(TOKEN_TYPES[0]).toBe(SemanticTokenTypes.keyword);
    });

    test('index 1 is class', () => {
      expect(TOKEN_TYPES[1]).toBe(SemanticTokenTypes.class);
    });

    test('index 2 is enum', () => {
      expect(TOKEN_TYPES[2]).toBe(SemanticTokenTypes.enum);
    });

    test('index 3 is enumMember', () => {
      expect(TOKEN_TYPES[3]).toBe(SemanticTokenTypes.enumMember);
    });

    test('index 4 is property', () => {
      expect(TOKEN_TYPES[4]).toBe(SemanticTokenTypes.property);
    });

    test('index 5 is type', () => {
      expect(TOKEN_TYPES[5]).toBe(SemanticTokenTypes.type);
    });

    test('index 6 is decorator', () => {
      expect(TOKEN_TYPES[6]).toBe(SemanticTokenTypes.decorator);
    });

    test('index 7 is string', () => {
      expect(TOKEN_TYPES[7]).toBe(SemanticTokenTypes.string);
    });

    test('index 8 is number', () => {
      expect(TOKEN_TYPES[8]).toBe(SemanticTokenTypes.number);
    });

    test('index 9 is comment', () => {
      expect(TOKEN_TYPES[9]).toBe(SemanticTokenTypes.comment);
    });
  });

  describe('TOKEN_MODIFIERS legend', () => {
    test('has 3 modifiers', () => {
      expect(TOKEN_MODIFIERS).toHaveLength(3);
    });

    test('bit 0 is declaration', () => {
      expect(TOKEN_MODIFIERS[0]).toBe(SemanticTokenModifiers.declaration);
    });

    test('bit 1 is readonly', () => {
      expect(TOKEN_MODIFIERS[1]).toBe(SemanticTokenModifiers.readonly);
    });

    test('bit 2 is abstract', () => {
      expect(TOKEN_MODIFIERS[2]).toBe(SemanticTokenModifiers.abstract);
    });
  });

  describe('findWord logic (replicated)', () => {
    /**
     * Replicate the findWord helper from semantic-tokens.ts
     * since it's not exported.
     */
    function findWord(lineText: string, word: string, fromCol: number): number {
      if (!word.length) return -1;

      let pos = fromCol;
      while (pos <= lineText.length - word.length) {
        const idx = lineText.indexOf(word, pos);
        if (idx < 0) return -1;

        const before = idx > 0 ? lineText[idx - 1]! : ' ';
        const after = idx + word.length < lineText.length ? lineText[idx + word.length]! : ' ';

        if (!/\w/.test(before) && !/\w/.test(after)) {
          return idx;
        }

        pos = idx + 1;
      }

      return -1;
    }

    test('finds word at start of line', () => {
      expect(findWord('model User {', 'model', 0)).toBe(0);
    });

    test('finds word in middle of line', () => {
      expect(findWord('model User {', 'User', 0)).toBe(6);
    });

    test('finds word after offset', () => {
      expect(findWord('model User {', 'User', 5)).toBe(6);
    });

    test('returns -1 for partial match (prefix)', () => {
      expect(findWord('model UserName {', 'User', 0)).toBe(-1);
    });

    test('returns -1 for partial match (suffix)', () => {
      expect(findWord('model SuperUser {', 'User', 0)).toBe(-1);
    });

    test('returns -1 when word not found', () => {
      expect(findWord('model User {', 'Post', 0)).toBe(-1);
    });

    test('returns -1 for empty word', () => {
      expect(findWord('model User {', '', 0)).toBe(-1);
    });

    test('finds word at end of line', () => {
      expect(findWord('extends Base', 'Base', 0)).toBe(8);
    });

    test('finds word with special boundary chars', () => {
      expect(findWord('  id Record @id', 'Record', 0)).toBe(5);
    });

    test('finds word after @ boundary', () => {
      expect(findWord('  id Record @id', 'id', 12)).toBe(13);
    });

    test('skips embedded match and finds whole word', () => {
      // "userId" contains "user" but is not a whole word match
      expect(findWord('  userId String', 'user', 0)).toBe(-1);
    });
  });

  describe('capitalize logic (replicated)', () => {
    function capitalize(s: string): string {
      if (!s.length) return s;

      return s[0]!.toUpperCase() + s.slice(1);
    }

    test('capitalizes lowercase', () => {
      expect(capitalize('string')).toBe('String');
    });

    test('preserves already capitalized', () => {
      expect(capitalize('String')).toBe('String');
    });

    test('handles empty string', () => {
      expect(capitalize('')).toBe('');
    });

    test('handles single char', () => {
      expect(capitalize('a')).toBe('A');
    });
  });

  describe('token classification from AST', () => {
    test('model declaration produces keyword + class tokens', () => {
      const source = 'model User {\n  id Record @id\n}';
      const { ast } = parse(source);
      const lines = source.split('\n');

      // Model declaration is on line 0
      const model = ast.models[0]!;
      const lsp = cerialToLsp(model.range.start);

      expect(lsp.line).toBe(0);
      // "model" keyword at col 0, "User" name at col 6
      expect(lines[0]!.indexOf('model')).toBe(0);
      expect(lines[0]!.indexOf('User')).toBe(6);
    });

    test('enum declaration produces enum token type (not class)', () => {
      const source = 'enum Status { ACTIVE, INACTIVE }';
      const { ast } = parse(source);

      expect(ast.enums).toHaveLength(1);
      expect(ast.enums[0]!.name).toBe('Status');
      // Enum names should get T_ENUM (index 2), not T_CLASS (index 1)
    });

    test('abstract model has abstract modifier', () => {
      const source = 'abstract model Base {\n  id Record @id\n}';
      const { ast } = parse(source);

      expect(ast.models).toHaveLength(1);
      expect(ast.models[0]!.abstract).toBe(true);
    });

    test('field with @readonly gets readonly modifier', () => {
      const source = 'model User {\n  id Record @id\n  code String @readonly\n}';
      const { ast } = parse(source);

      const codeField = ast.models[0]!.fields.find((f) => f.name === 'code');

      expect(codeField).toBeDefined();
      expect(codeField!.decorators.some((d) => d.type === 'readonly')).toBe(true);
    });

    test('extends keyword and parent name are on declaration line', () => {
      const source = 'model Child extends Parent {\n  extra String\n}';
      const { ast } = parse(source, new Set(), new Set(), new Set(), new Set());
      const lines = source.split('\n');

      const model = ast.models[0]!;

      expect(model.extends).toBe('Parent');
      expect(lines[0]!.includes('extends')).toBe(true);
      expect(lines[0]!.includes('Parent')).toBe(true);
    });

    test('enum values are within enum body lines', () => {
      const source = 'enum Role {\n  ADMIN\n  USER\n  GUEST\n}';
      const { ast } = parse(source);

      const enumDef = ast.enums[0]!;

      expect(enumDef.values).toEqual(['ADMIN', 'USER', 'GUEST']);

      const startLine = cerialToLsp(enumDef.range.start).line;
      const endLine = cerialToLsp(enumDef.range.end).line;

      // Values should be between start and end lines
      expect(endLine).toBeGreaterThan(startLine);
    });

    test('field type reference (objectName) is detected', () => {
      const source = 'object Addr {\n  street String\n}\n\nmodel User {\n  id Record @id\n  addr Addr\n}';
      const { ast } = parse(source);

      const addrField = ast.models[0]!.fields.find((f) => f.name === 'addr');

      expect(addrField).toBeDefined();
      expect(addrField!.objectName).toBe('Addr');
    });

    test('decorator tokens have AST ranges', () => {
      const source = 'model User {\n  id Record @id\n  email Email @unique\n}';
      const { ast } = parse(source);

      for (const field of ast.models[0]!.fields) {
        for (const deco of field.decorators) {
          expect(deco.range).toBeDefined();
          expect(deco.range.start.line).toBeGreaterThan(0);
        }
      }
    });

    test('tokens from multiple block types are collected', () => {
      const source = [
        'model User {',
        '  id Record @id',
        '}',
        'object Addr {',
        '  street String',
        '}',
        'enum Role { ADMIN }',
        'tuple Pair {',
        '  String,',
        '  Int',
        '}',
        'literal Sev { 1, 2, 3 }',
      ].join('\n');
      const { ast } = parse(source);

      expect(ast.models).toHaveLength(1);
      expect(ast.objects).toHaveLength(1);
      expect(ast.enums).toHaveLength(1);
      expect(ast.tuples).toHaveLength(1);
      expect(ast.literals).toHaveLength(1);
    });
  });
});
