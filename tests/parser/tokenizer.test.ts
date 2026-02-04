/**
 * Tokenizer tests
 * New schema format: fieldName Type @decorators
 */

import { test, expect, describe } from 'bun:test';
import { tokenize, filterTokens } from '../../src/parser/tokenizer';

describe('tokenizer', () => {
  test('tokenizes simple model declaration', () => {
    const source = `model User {
  id Record @id
}`;
    const tokens = tokenize(source);
    const filtered = filterTokens(tokens);

    expect(filtered.some((t) => t.type === 'keyword' && t.value === 'model')).toBe(true);
    expect(filtered.some((t) => t.type === 'identifier' && t.value === 'User')).toBe(true);
    expect(filtered.some((t) => t.type === 'punctuation' && t.value === '{')).toBe(true);
    expect(filtered.some((t) => t.type === 'identifier' && t.value === 'id')).toBe(true);
    expect(filtered.some((t) => t.type === 'type' && t.value === 'Record')).toBe(true);
    expect(filtered.some((t) => t.type === 'punctuation' && t.value === '}')).toBe(true);
  });

  test('tokenizes decorators', () => {
    const source = `id Record @id
email Email @unique
createdAt Date @now
name String @default("test")`;
    const tokens = tokenize(source);
    const decorators = tokens.filter((t) => t.type === 'decorator');

    expect(decorators.length).toBe(4);
    expect(decorators[0]?.value).toBe('@id');
    expect(decorators[1]?.value).toBe('@unique');
    expect(decorators[2]?.value).toBe('@now');
    expect(decorators[3]?.value).toBe('@default("test")');
  });

  test('tokenizes comments', () => {
    const source = `// This is a comment
model User {}`;
    const tokens = tokenize(source);
    const comments = tokens.filter((t) => t.type === 'comment');

    expect(comments.length).toBe(1);
    expect(comments[0]?.value).toContain('This is a comment');
  });

  test('tokenizes optional types', () => {
    const source = `name String?`;
    const tokens = tokenize(source);
    const filtered = filterTokens(tokens);

    expect(filtered.some((t) => t.type === 'punctuation' && t.value === '?')).toBe(true);
  });

  test('tokenizes all field types (UpperFirst)', () => {
    const source = `
      a String
      b Email
      c Int
      d Date
      e Bool
      f Float
    `;
    const tokens = tokenize(source);
    const types = tokens.filter((t) => t.type === 'type');

    expect(types.length).toBe(6);
    expect(types.map((t) => t.value)).toContain('String');
    expect(types.map((t) => t.value)).toContain('Email');
    expect(types.map((t) => t.value)).toContain('Int');
    expect(types.map((t) => t.value)).toContain('Date');
    expect(types.map((t) => t.value)).toContain('Bool');
    expect(types.map((t) => t.value)).toContain('Float');
  });
});
