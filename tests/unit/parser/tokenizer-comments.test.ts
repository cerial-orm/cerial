/**
 * Unit Tests: Tokenizer - Hash comments, brackets, commas
 *
 * Tests for # single-line comments, [ ] brackets, and , commas as tokens.
 */

import { describe, expect, test } from 'bun:test';
import { filterTokens, tokenize } from '../../../src/parser/tokenizer';
import { removeComments } from '../../../src/utils/string-utils';

describe('Tokenizer - Hash comments', () => {
  test('should tokenize # comment at start of line', () => {
    const tokens = tokenize('# This is a comment\nmodel User {');
    const commentTokens = tokens.filter((t) => t.type === 'comment');

    expect(commentTokens).toHaveLength(1);
    expect(commentTokens[0]?.type).toBe('comment');
    expect(commentTokens[0]?.value).toBe('# This is a comment');
    expect(commentTokens[0]?.position).toEqual({ line: 1, column: 0, offset: 0 });
  });

  test('should tokenize # comment at end of line', () => {
    const tokens = tokenize('id Record @id # primary key');
    const commentTokens = tokens.filter((t) => t.type === 'comment');

    expect(commentTokens).toHaveLength(1);
    expect(commentTokens[0]?.value).toBe('# primary key');
  });

  test('should not treat # inside decorator string as comment', () => {
    const tokens = tokenize("@default('#hash')");
    const filtered = filterTokens(tokens);

    // The entire decorator including #hash is one decorator token
    expect(filtered).toHaveLength(2); // decorator + eof
    expect(filtered[0]?.type).toBe('decorator');
    expect(filtered[0]?.value).toBe("@default('#hash')");
    // No comment tokens should exist
    expect(tokens.filter((t) => t.type === 'comment')).toHaveLength(0);
  });

  test('should filter out # comments with filterTokens', () => {
    const tokens = tokenize('model # comment\nUser');
    const filtered = filterTokens(tokens);

    expect(filtered.some((t) => t.type === 'comment')).toBe(false);
    expect(filtered[0]?.value).toBe('model');
    expect(filtered[1]?.value).toBe('User');
  });

  test('should handle # comment on empty line', () => {
    const tokens = tokenize('#');
    const commentTokens = tokens.filter((t) => t.type === 'comment');

    expect(commentTokens).toHaveLength(1);
    expect(commentTokens[0]?.value).toBe('#');
  });

  test('should handle multiple # comments', () => {
    const tokens = tokenize('# first\n# second\nmodel User {');
    const commentTokens = tokens.filter((t) => t.type === 'comment');

    expect(commentTokens).toHaveLength(2);
    expect(commentTokens[0]?.value).toBe('# first');
    expect(commentTokens[1]?.value).toBe('# second');
  });

  test('existing // comments still work', () => {
    const tokens = tokenize('// this is a comment');
    const commentTokens = tokens.filter((t) => t.type === 'comment');

    expect(commentTokens).toHaveLength(1);
    expect(commentTokens[0]?.value).toBe('// this is a comment');
  });

  test('existing /* */ comments still work', () => {
    const tokens = tokenize('/* multi\nline */');
    const commentTokens = tokens.filter((t) => t.type === 'comment');

    expect(commentTokens).toHaveLength(1);
    expect(commentTokens[0]?.value).toContain('multi');
  });
});

describe('Tokenizer - Brackets', () => {
  test('should tokenize [ and ] as punctuation', () => {
    const tokens = tokenize('String[]');
    const filtered = filterTokens(tokens);

    expect(filtered).toHaveLength(4); // type 'String', '[', ']', eof
    expect(filtered[0]?.type).toBe('type');
    expect(filtered[0]?.value).toBe('String');
    expect(filtered[1]?.type).toBe('punctuation');
    expect(filtered[1]?.value).toBe('[');
    expect(filtered[2]?.type).toBe('punctuation');
    expect(filtered[2]?.value).toBe(']');
  });

  test('should tokenize brackets in standalone context', () => {
    const tokens = tokenize('[a, b]');
    const filtered = filterTokens(tokens);

    expect(filtered[0]?.type).toBe('punctuation');
    expect(filtered[0]?.value).toBe('[');
    expect(filtered[1]?.type).toBe('identifier');
    expect(filtered[1]?.value).toBe('a');
    expect(filtered[2]?.type).toBe('punctuation');
    expect(filtered[2]?.value).toBe(',');
    expect(filtered[3]?.type).toBe('identifier');
    expect(filtered[3]?.value).toBe('b');
    expect(filtered[4]?.type).toBe('punctuation');
    expect(filtered[4]?.value).toBe(']');
  });
});

describe('Tokenizer - Commas', () => {
  test('should tokenize comma as punctuation', () => {
    const tokens = tokenize('lat Float, lng Float');
    const filtered = filterTokens(tokens);
    const commaTokens = filtered.filter((t) => t.value === ',');

    expect(commaTokens).toHaveLength(1);
    expect(commaTokens[0]?.type).toBe('punctuation');
  });

  test('should tokenize multiple commas', () => {
    const tokens = tokenize('a, b, c');
    const filtered = filterTokens(tokens);
    const commaTokens = filtered.filter((t) => t.value === ',');

    expect(commaTokens).toHaveLength(2);
    expect(commaTokens[0]?.type).toBe('punctuation');
    expect(commaTokens[1]?.type).toBe('punctuation');
  });
});

describe('removeComments - Hash support', () => {
  test('should strip # comments', () => {
    expect(removeComments('id Record @id # primary key')).toBe('id Record @id ');
  });

  test('should strip // comments (existing)', () => {
    expect(removeComments('id Record @id // primary key')).toBe('id Record @id ');
  });

  test('should handle line with only # comment', () => {
    expect(removeComments('# full line comment')).toBe('');
  });

  test('should handle line with no comments', () => {
    expect(removeComments('id Record @id')).toBe('id Record @id');
  });

  test('should not strip # inside single-quoted string', () => {
    expect(removeComments("@default('#hash')")).toBe("@default('#hash')");
  });

  test('should not strip # inside double-quoted string', () => {
    expect(removeComments('@default("#hash")')).toBe('@default("#hash")');
  });

  test('should strip # after quoted string', () => {
    expect(removeComments("@default('#hash') # comment")).toBe("@default('#hash') ");
  });

  test('should prefer // when it appears before #', () => {
    expect(removeComments('field // comment # not reached')).toBe('field ');
  });

  test('should prefer # when it appears before //', () => {
    expect(removeComments('field # comment // not reached')).toBe('field ');
  });
});
