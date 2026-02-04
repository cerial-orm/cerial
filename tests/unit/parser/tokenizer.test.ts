/**
 * Unit Tests: Tokenizer
 *
 * Tests tokenization of .cerial schema files.
 */

import { describe, expect, test } from 'bun:test';
import { tokenize, filterTokens } from '../../../src/parser/tokenizer';

describe('Tokenizer', () => {
  describe('tokenize', () => {
    test('should tokenize empty input', () => {
      const tokens = tokenize('');

      expect(tokens).toHaveLength(1);
      expect(tokens[0]?.type).toBe('eof');
    });

    test('should tokenize whitespace', () => {
      const tokens = tokenize('   \t  ');
      const wsTokens = tokens.filter((t) => t.type === 'whitespace');

      expect(wsTokens.length).toBeGreaterThan(0);
    });

    test('should tokenize newlines', () => {
      const tokens = tokenize('line1\nline2');
      const nlTokens = tokens.filter((t) => t.type === 'newline');

      expect(nlTokens).toHaveLength(1);
    });
  });

  describe('keywords', () => {
    test('should tokenize model keyword', () => {
      const tokens = tokenize('model');
      const filtered = filterTokens(tokens);

      expect(filtered[0]?.type).toBe('keyword');
      expect(filtered[0]?.value).toBe('model');
    });
  });

  describe('types', () => {
    test('should tokenize String type', () => {
      const tokens = tokenize('String');
      const filtered = filterTokens(tokens);

      expect(filtered[0]?.type).toBe('type');
      expect(filtered[0]?.value).toBe('String');
    });

    test('should tokenize all built-in types', () => {
      const types = ['String', 'Email', 'Int', 'Float', 'Bool', 'Date'];

      for (const typeName of types) {
        const tokens = tokenize(typeName);
        const filtered = filterTokens(tokens);

        expect(filtered[0]?.type).toBe('type');
        expect(filtered[0]?.value).toBe(typeName);
      }
    });
  });

  describe('identifiers', () => {
    test('should tokenize simple identifier', () => {
      const tokens = tokenize('myField');
      const filtered = filterTokens(tokens);

      expect(filtered[0]?.type).toBe('identifier');
      expect(filtered[0]?.value).toBe('myField');
    });

    test('should tokenize identifier with underscore', () => {
      const tokens = tokenize('my_field');
      const filtered = filterTokens(tokens);

      expect(filtered[0]?.type).toBe('identifier');
      expect(filtered[0]?.value).toBe('my_field');
    });

    test('should tokenize identifier starting with underscore', () => {
      const tokens = tokenize('_private');
      const filtered = filterTokens(tokens);

      expect(filtered[0]?.type).toBe('identifier');
      expect(filtered[0]?.value).toBe('_private');
    });
  });

  describe('decorators', () => {
    test('should tokenize simple decorator', () => {
      const tokens = tokenize('@id');
      const filtered = filterTokens(tokens);

      expect(filtered[0]?.type).toBe('decorator');
      expect(filtered[0]?.value).toBe('@id');
    });

    test('should tokenize decorator with parentheses', () => {
      const tokens = tokenize('@default(true)');
      const filtered = filterTokens(tokens);

      expect(filtered[0]?.type).toBe('decorator');
      expect(filtered[0]?.value).toBe('@default(true)');
    });

    test('should tokenize decorator with string value', () => {
      const tokens = tokenize('@default("test")');
      const filtered = filterTokens(tokens);

      expect(filtered[0]?.type).toBe('decorator');
      expect(filtered[0]?.value).toBe('@default("test")');
    });

    test('should tokenize @model decorator', () => {
      const tokens = tokenize('@model(User)');
      const filtered = filterTokens(tokens);

      expect(filtered[0]?.type).toBe('decorator');
      expect(filtered[0]?.value).toBe('@model(User)');
    });

    test('should tokenize @field decorator', () => {
      const tokens = tokenize('@field(userId)');
      const filtered = filterTokens(tokens);

      expect(filtered[0]?.type).toBe('decorator');
      expect(filtered[0]?.value).toBe('@field(userId)');
    });

    test('should tokenize @key decorator', () => {
      const tokens = tokenize('@key(author)');
      const filtered = filterTokens(tokens);

      expect(filtered[0]?.type).toBe('decorator');
      expect(filtered[0]?.value).toBe('@key(author)');
    });

    test('should tokenize @onDelete decorator', () => {
      const tokens = tokenize('@onDelete(Cascade)');
      const filtered = filterTokens(tokens);

      expect(filtered[0]?.type).toBe('decorator');
      expect(filtered[0]?.value).toBe('@onDelete(Cascade)');
    });
  });

  describe('punctuation', () => {
    test('should tokenize braces', () => {
      const tokens = tokenize('{}');
      const filtered = filterTokens(tokens);

      expect(filtered[0]?.type).toBe('punctuation');
      expect(filtered[0]?.value).toBe('{');
      expect(filtered[1]?.type).toBe('punctuation');
      expect(filtered[1]?.value).toBe('}');
    });

    test('should tokenize question mark', () => {
      const tokens = tokenize('?');
      const filtered = filterTokens(tokens);

      expect(filtered[0]?.type).toBe('punctuation');
      expect(filtered[0]?.value).toBe('?');
    });

    test('should tokenize colon', () => {
      const tokens = tokenize(':');
      const filtered = filterTokens(tokens);

      expect(filtered[0]?.type).toBe('punctuation');
      expect(filtered[0]?.value).toBe(':');
    });
  });

  describe('comments', () => {
    test('should tokenize single-line comment', () => {
      const tokens = tokenize('// this is a comment');
      const commentTokens = tokens.filter((t) => t.type === 'comment');

      expect(commentTokens).toHaveLength(1);
      expect(commentTokens[0]?.value).toBe('// this is a comment');
    });

    test('should tokenize multi-line comment', () => {
      const tokens = tokenize('/* multi\nline */');
      const commentTokens = tokens.filter((t) => t.type === 'comment');

      expect(commentTokens).toHaveLength(1);
      expect(commentTokens[0]?.value).toContain('multi');
    });

    test('should filter out comments', () => {
      const tokens = tokenize('model // comment\nUser');
      const filtered = filterTokens(tokens);

      expect(filtered.some((t) => t.type === 'comment')).toBe(false);
    });
  });

  describe('strings', () => {
    test('should tokenize double-quoted string', () => {
      const tokens = tokenize('"hello"');
      const filtered = filterTokens(tokens);

      expect(filtered[0]?.type).toBe('string');
      expect(filtered[0]?.value).toBe('"hello"');
    });

    test('should tokenize single-quoted string', () => {
      const tokens = tokenize("'hello'");
      const filtered = filterTokens(tokens);

      expect(filtered[0]?.type).toBe('string');
      expect(filtered[0]?.value).toBe("'hello'");
    });

    test('should handle escaped quotes', () => {
      const tokens = tokenize('"hello\\"world"');
      const filtered = filterTokens(tokens);

      expect(filtered[0]?.type).toBe('string');
    });
  });

  describe('numbers', () => {
    test('should tokenize integer', () => {
      const tokens = tokenize('42');
      const filtered = filterTokens(tokens);

      expect(filtered[0]?.type).toBe('number');
      expect(filtered[0]?.value).toBe('42');
    });

    test('should tokenize float', () => {
      const tokens = tokenize('3.14');
      const filtered = filterTokens(tokens);

      expect(filtered[0]?.type).toBe('number');
      expect(filtered[0]?.value).toBe('3.14');
    });

    test('should tokenize negative number', () => {
      const tokens = tokenize('-42');
      const filtered = filterTokens(tokens);

      expect(filtered[0]?.type).toBe('number');
      expect(filtered[0]?.value).toBe('-42');
    });
  });

  describe('booleans', () => {
    test('should tokenize true', () => {
      const tokens = tokenize('true');
      const filtered = filterTokens(tokens);

      expect(filtered[0]?.type).toBe('boolean');
      expect(filtered[0]?.value).toBe('true');
    });

    test('should tokenize false', () => {
      const tokens = tokenize('false');
      const filtered = filterTokens(tokens);

      expect(filtered[0]?.type).toBe('boolean');
      expect(filtered[0]?.value).toBe('false');
    });
  });

  describe('position tracking', () => {
    test('should track line numbers', () => {
      const tokens = tokenize('model\nUser');
      const filtered = filterTokens(tokens);

      expect(filtered[0]?.position.line).toBe(1);
      expect(filtered[1]?.position.line).toBe(2);
    });

    test('should track column numbers', () => {
      const tokens = tokenize('model User');
      const filtered = filterTokens(tokens);

      // Tokenizer uses 0-based columns
      expect(filtered[0]?.position.column).toBe(0);
      expect(filtered[1]?.position.column).toBe(6);
    });
  });

  describe('full model tokenization', () => {
    test('should tokenize simple model', () => {
      const source = `
model User {
  id Record @id
  name String
}`;
      const tokens = tokenize(source);
      const filtered = filterTokens(tokens);

      expect(filtered.some((t) => t.value === 'model')).toBe(true);
      expect(filtered.some((t) => t.value === 'User')).toBe(true);
      expect(filtered.some((t) => t.value === '@id')).toBe(true);
    });
  });
});

describe('filterTokens', () => {
  test('should remove whitespace tokens', () => {
    const tokens = tokenize('model   User');
    const filtered = filterTokens(tokens);

    expect(filtered.some((t) => t.type === 'whitespace')).toBe(false);
  });

  test('should remove comment tokens', () => {
    const tokens = tokenize('model // comment\nUser');
    const filtered = filterTokens(tokens);

    expect(filtered.some((t) => t.type === 'comment')).toBe(false);
  });

  test('should remove newline tokens', () => {
    const tokens = tokenize('model\nUser');
    const filtered = filterTokens(tokens);

    expect(filtered.some((t) => t.type === 'newline')).toBe(false);
  });

  test('should preserve significant tokens', () => {
    const tokens = tokenize('model User { id Record @id }');
    const filtered = filterTokens(tokens);

    const types = filtered.map((t) => t.type);
    expect(types).toContain('keyword');
    expect(types).toContain('identifier');
    expect(types).toContain('punctuation');
    expect(types).toContain('type');
    expect(types).toContain('decorator');
  });
});
