/**
 * Tests for comment attacher
 */

import { describe, expect, it } from 'bun:test';
import type { CommentMap } from '../../../src/formatter/comment-attacher';
import { attachComments, detectCommentStyle } from '../../../src/formatter/comment-attacher';
import { parse } from '../../../src/parser/parser';
import { tokenize } from '../../../src/parser/tokenizer';
import type { Token } from '../../../src/types';

/** Helper to get leading comment values for a key */
function getLeading(map: CommentMap, key: string): string[] {
  const entry = map.get(key);
  if (!entry) return [];

  return entry.leading.map((t) => t.value);
}

/** Helper to get trailing comment values for a key */
function getTrailing(map: CommentMap, key: string): string[] {
  const entry = map.get(key);
  if (!entry) return [];

  return entry.trailing.map((t) => t.value);
}

describe('attachComments', () => {
  describe('file header comments', () => {
    it('should attach comments before first declaration to top', () => {
      const src = '# Header\n\nmodel User {\n  id Record @id\n}';
      const tokens = tokenize(src);
      const { ast } = parse(src);
      const map = attachComments(tokens, ast);

      expect(getLeading(map, 'top')).toEqual(['# Header']);
    });

    it('should attach multiple header comments to top', () => {
      const src = '# Line 1\n# Line 2\n# Line 3\n\nmodel User {\n  id Record @id\n}';
      const tokens = tokenize(src);
      const { ast } = parse(src);
      const map = attachComments(tokens, ast);

      expect(getLeading(map, 'top')).toEqual(['# Line 1', '# Line 2', '# Line 3']);
    });

    it('should handle slash-style header comments', () => {
      const src = '// Header\n\nmodel User {\n  id Record @id\n}';
      const tokens = tokenize(src);
      const { ast } = parse(src);
      const map = attachComments(tokens, ast);

      expect(getLeading(map, 'top')).toEqual(['// Header']);
    });
  });

  describe('field leading comments', () => {
    it('should attach comment before a field as leading', () => {
      const src = 'model User {\n  # ID field\n  id Record @id\n}';
      const tokens = tokenize(src);
      const { ast } = parse(src);
      const map = attachComments(tokens, ast);

      expect(getLeading(map, 'field:User.id')).toEqual(['# ID field']);
    });

    it('should attach multiple comments before a field', () => {
      const src = 'model User {\n  # Primary key\n  # Auto-generated\n  id Record @id\n}';
      const tokens = tokenize(src);
      const { ast } = parse(src);
      const map = attachComments(tokens, ast);

      expect(getLeading(map, 'field:User.id')).toEqual(['# Primary key', '# Auto-generated']);
    });

    it('should attach comments to correct fields', () => {
      const src = 'model User {\n  # ID field\n  id Record @id\n  # Name field\n  name String\n}';
      const tokens = tokenize(src);
      const { ast } = parse(src);
      const map = attachComments(tokens, ast);

      expect(getLeading(map, 'field:User.id')).toEqual(['# ID field']);
      expect(getLeading(map, 'field:User.name')).toEqual(['# Name field']);
    });
  });

  describe('field trailing comments', () => {
    it('should attach same-line comment as trailing', () => {
      const src = 'model User {\n  email Email // must be unique\n}';
      const tokens = tokenize(src);
      const { ast } = parse(src);
      const map = attachComments(tokens, ast);

      expect(getTrailing(map, 'field:User.email')).toEqual(['// must be unique']);
    });

    it('should attach hash trailing comment', () => {
      const src = 'model User {\n  email Email # must be unique\n}';
      const tokens = tokenize(src);
      const { ast } = parse(src);
      const map = attachComments(tokens, ast);

      expect(getTrailing(map, 'field:User.email')).toEqual(['# must be unique']);
    });
  });

  describe('between-block comments', () => {
    it('should attach comment between blocks as leading to next block', () => {
      const src = 'model A {\n  id Record @id\n}\n\n# Divider\n\nmodel B {\n  id Record @id\n}';
      const tokens = tokenize(src);
      const { ast } = parse(src);
      const map = attachComments(tokens, ast);

      expect(getLeading(map, 'model:B')).toEqual(['# Divider']);
      expect(map.has('model:A')).toBe(false);
    });

    it('should attach multiple between-block comments to next block', () => {
      const src = 'model A {\n  id Record @id\n}\n\n# Section\n# Break\n\nmodel B {\n  id Record @id\n}';
      const tokens = tokenize(src);
      const { ast } = parse(src);
      const map = attachComments(tokens, ast);

      expect(getLeading(map, 'model:B')).toEqual(['# Section', '# Break']);
    });
  });

  describe('multi-line comments', () => {
    it('should attach /* */ comment before block as leading', () => {
      const src = '/* Description */\nmodel X {\n  id Record @id\n}';
      const tokens = tokenize(src);
      const { ast } = parse(src);
      const map = attachComments(tokens, ast);

      expect(getLeading(map, 'model:X')).toEqual(['/* Description */']);
    });
  });

  describe('EOF trailing comments', () => {
    it('should attach comments after last block to bottom', () => {
      const src = 'model User {\n  id Record @id\n}\n\n# End of file';
      const tokens = tokenize(src);
      const { ast } = parse(src);
      const map = attachComments(tokens, ast);

      expect(getLeading(map, 'bottom')).toEqual(['# End of file']);
    });

    it('should attach multiple trailing comments to bottom', () => {
      const src = 'model User {\n  id Record @id\n}\n# Note 1\n# Note 2';
      const tokens = tokenize(src);
      const { ast } = parse(src);
      const map = attachComments(tokens, ast);

      expect(getLeading(map, 'bottom')).toEqual(['# Note 1', '# Note 2']);
    });
  });

  describe('empty file with only comments', () => {
    it('should attach all comments to top when no AST nodes', () => {
      const src = '# Just a comment\n# Another comment';
      const tokens = tokenize(src);
      const { ast } = parse(src);
      const map = attachComments(tokens, ast);

      expect(getLeading(map, 'top')).toEqual(['# Just a comment', '# Another comment']);
    });
  });

  describe('no comments', () => {
    it('should return empty map when no comments', () => {
      const src = 'model User {\n  id Record @id\n}';
      const tokens = tokenize(src);
      const { ast } = parse(src);
      const map = attachComments(tokens, ast);

      expect(map.size).toBe(0);
    });
  });

  describe('object blocks', () => {
    it('should attach comments to object fields', () => {
      const src = 'object Address {\n  # Street line\n  street String\n  city String\n}';
      const tokens = tokenize(src);
      const { ast } = parse(src);
      const map = attachComments(tokens, ast);

      expect(getLeading(map, 'field:Address.street')).toEqual(['# Street line']);
    });

    it('should attach leading comment before object block', () => {
      const src = '# Address type\nobject Address {\n  street String\n}';
      const tokens = tokenize(src);
      const { ast } = parse(src);
      const map = attachComments(tokens, ast);

      expect(getLeading(map, 'object:Address')).toEqual(['# Address type']);
    });
  });

  describe('enum blocks', () => {
    it('should attach leading comment before enum block', () => {
      const src = '# User roles\nenum Role {\n  Admin\n  Editor\n}';
      const tokens = tokenize(src);
      const { ast } = parse(src);
      const map = attachComments(tokens, ast);

      expect(getLeading(map, 'enum:Role')).toEqual(['# User roles']);
    });

    it('should attach comments inside enum to enum block', () => {
      const src = 'enum Role {\n  # Admin role\n  Admin\n  Editor\n}';
      const tokens = tokenize(src);
      const { ast } = parse(src);
      const map = attachComments(tokens, ast);

      // Enum values don't have individual ranges, comments go to block
      expect(getLeading(map, 'enum:Role')).toEqual(['# Admin role']);
    });
  });

  describe('block-level trailing comments', () => {
    it('should attach same-line comment on block declaration as trailing', () => {
      const src = 'model User { # Main model\n  id Record @id\n}';
      const tokens = tokenize(src);
      const { ast } = parse(src);
      const map = attachComments(tokens, ast);

      expect(getTrailing(map, 'model:User')).toEqual(['# Main model']);
    });
  });

  describe('mixed block types', () => {
    it('should handle comments across model, object, and enum blocks', () => {
      const src = [
        '# File header',
        '',
        '# User model',
        'model User {',
        '  id Record @id',
        '  name String',
        '}',
        '',
        '# Address type',
        'object Address {',
        '  street String',
        '}',
        '',
        '# Role enum',
        'enum Role {',
        '  Admin',
        '}',
      ].join('\n');
      const tokens = tokenize(src);
      const { ast } = parse(src);
      const map = attachComments(tokens, ast);

      expect(getLeading(map, 'top')).toEqual(['# File header']);
      expect(getLeading(map, 'model:User')).toEqual(['# User model']);
      expect(getLeading(map, 'object:Address')).toEqual(['# Address type']);
      expect(getLeading(map, 'enum:Role')).toEqual(['# Role enum']);
    });
  });

  describe('comment after all children in block', () => {
    it('should attach comment after last field as trailing on block', () => {
      const src = 'model User {\n  id Record @id\n  # TODO: add more fields\n}';
      const tokens = tokenize(src);
      const { ast } = parse(src);
      const map = attachComments(tokens, ast);

      // Comment after last field but before closing brace
      // The field is on line 2, comment on line 3, closing brace on line 4
      // Comment is inside the block but after all children
      // Should go to trailing of the block or leading of the last field...
      // Since comment line > last field line, it goes after all children → block trailing
      expect(getTrailing(map, 'model:User')).toEqual(['# TODO: add more fields']);
    });
  });

  describe('leading comment for first field is not block leading', () => {
    it('should distinguish block leading from field leading', () => {
      const src = ['# Model comment', 'model User {', '  # Field comment', '  id Record @id', '}'].join('\n');
      const tokens = tokenize(src);
      const { ast } = parse(src);
      const map = attachComments(tokens, ast);

      expect(getLeading(map, 'model:User')).toEqual(['# Model comment']);
      expect(getLeading(map, 'field:User.id')).toEqual(['# Field comment']);
    });
  });
});

describe('detectCommentStyle', () => {
  it('should return hash when all comments use #', () => {
    const tokens = tokenize('# comment 1\n# comment 2\nmodel X {\n  id Record @id\n}');

    expect(detectCommentStyle(tokens)).toBe('hash');
  });

  it('should return slash when all comments use //', () => {
    const tokens = tokenize('// comment 1\n// comment 2\nmodel X {\n  id Record @id\n}');

    expect(detectCommentStyle(tokens)).toBe('slash');
  });

  it('should return slash when all comments use /* */', () => {
    const tokens = tokenize('/* comment 1 */\nmodel X {\n  id Record @id\n}');

    expect(detectCommentStyle(tokens)).toBe('slash');
  });

  it('should return mixed when # and // are both used', () => {
    const tokens = tokenize('# comment 1\n// comment 2\nmodel X {\n  id Record @id\n}');

    expect(detectCommentStyle(tokens)).toBe('mixed');
  });

  it('should return mixed when # and /* */ are both used', () => {
    const tokens = tokenize('# comment 1\n/* comment 2 */\nmodel X {\n  id Record @id\n}');

    expect(detectCommentStyle(tokens)).toBe('mixed');
  });

  it('should return hash when no comments present (default)', () => {
    const tokens = tokenize('model X {\n  id Record @id\n}');

    expect(detectCommentStyle(tokens)).toBe('hash');
  });

  it('should return hash for empty token stream', () => {
    const tokens: Token[] = [];

    expect(detectCommentStyle(tokens)).toBe('hash');
  });

  it('should return slash for mixed // and /* */ (both are slash-style)', () => {
    const tokens = tokenize('// line\n/* block */\nmodel X {\n  id Record @id\n}');

    expect(detectCommentStyle(tokens)).toBe('slash');
  });
});
