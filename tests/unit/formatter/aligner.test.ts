/**
 * Tests for column alignment of schema fields
 */

import { describe, expect, it } from 'bun:test';
import type { AlignedField } from '../../../src/formatter/aligner';
import { alignFields, calculateColumnWidths } from '../../../src/formatter/aligner';
import type { FormatConfig } from '../../../src/formatter/types';
import { FORMAT_DEFAULTS } from '../../../src/formatter/types';

// Helper to create a resolved config with overrides
function config(overrides?: FormatConfig): Required<FormatConfig> {
  return { ...FORMAT_DEFAULTS, ...overrides };
}

// Helper to create an AlignedField
function field(
  name: string,
  typeWithModifiers: string,
  decoratorString = '',
  hasBlankLineAfter = false,
  trailingComment?: string,
): AlignedField {
  return { name, typeWithModifiers, decoratorString, hasBlankLineAfter, trailingComment };
}

describe('calculateColumnWidths', () => {
  describe('empty input', () => {
    it('should return empty array for no fields', () => {
      const result = calculateColumnWidths([], config());
      expect(result).toEqual([]);
    });
  });

  describe('single field', () => {
    it('should return exact field widths', () => {
      const fields = [field('id', 'Record', '@id')];
      const result = calculateColumnWidths(fields, config());
      expect(result).toEqual([{ nameWidth: 2, typeWidth: 6, decoratorWidth: 3, hasPrivate: false }]);
    });
  });

  describe('group alignment (default)', () => {
    it('should calculate widths per group split by blank lines', () => {
      const fields = [
        field('id', 'Record', '@id', false),
        field('email', 'Email', '@unique', true), // blank line after → group boundary
        field('createdAt', 'Date', '@createdAt', false),
      ];
      const result = calculateColumnWidths(fields, config({ alignmentScope: 'group' }));

      // Group 1: [id, email] → nameWidth=5 (email), typeWidth=6 (Record)
      expect(result[0]).toEqual({ nameWidth: 5, typeWidth: 6, decoratorWidth: 7, hasPrivate: false });
      expect(result[1]).toEqual({ nameWidth: 5, typeWidth: 6, decoratorWidth: 7, hasPrivate: false });

      // Group 2: [createdAt] → nameWidth=9, typeWidth=4
      expect(result[2]).toEqual({ nameWidth: 9, typeWidth: 4, decoratorWidth: 10, hasPrivate: false });
    });

    it('should handle multiple groups with different widths', () => {
      const fields = [
        field('a', 'Int', '', true), // group 1
        field('bb', 'String', '', true), // group 2
        field('ccc', 'Bool', '', false), // group 3
      ];
      const result = calculateColumnWidths(fields, config({ alignmentScope: 'group' }));

      expect(result[0]).toEqual({ nameWidth: 1, typeWidth: 3, decoratorWidth: 0, hasPrivate: false }); // group 1: a/Int
      expect(result[1]).toEqual({ nameWidth: 2, typeWidth: 6, decoratorWidth: 0, hasPrivate: false }); // group 2: bb/String
      expect(result[2]).toEqual({ nameWidth: 3, typeWidth: 4, decoratorWidth: 0, hasPrivate: false }); // group 3: ccc/Bool
    });

    it('should treat all fields as one group when no blank lines', () => {
      const fields = [
        field('id', 'Record', '@id', false),
        field('email', 'Email', '@unique', false),
        field('createdAt', 'Date', '@createdAt', false),
      ];
      const result = calculateColumnWidths(fields, config({ alignmentScope: 'group' }));

      // All in one group: nameWidth=9, typeWidth=6
      expect(result[0]).toEqual({ nameWidth: 9, typeWidth: 6, decoratorWidth: 10, hasPrivate: false });
      expect(result[1]).toEqual({ nameWidth: 9, typeWidth: 6, decoratorWidth: 10, hasPrivate: false });
      expect(result[2]).toEqual({ nameWidth: 9, typeWidth: 6, decoratorWidth: 10, hasPrivate: false });
    });

    it('should not start new group for blank line on last field', () => {
      const fields = [
        field('id', 'Record', '@id', false),
        field('email', 'Email', '@unique', true), // last field, blank line = no effect
      ];
      const result = calculateColumnWidths(fields, config({ alignmentScope: 'group' }));

      // Both in same group
      expect(result[0]).toEqual({ nameWidth: 5, typeWidth: 6, decoratorWidth: 7, hasPrivate: false });
      expect(result[1]).toEqual({ nameWidth: 5, typeWidth: 6, decoratorWidth: 7, hasPrivate: false });
    });
  });

  describe('block alignment', () => {
    it('should calculate widths across all fields ignoring blank lines', () => {
      const fields = [
        field('id', 'Record', '@id', false),
        field('email', 'Email', '@unique', true), // blank line ignored
        field('createdAt', 'Date', '@createdAt', false),
      ];
      const result = calculateColumnWidths(fields, config({ alignmentScope: 'block' }));

      // All fields: nameWidth=9 (createdAt), typeWidth=6 (Record)
      expect(result[0]).toEqual({ nameWidth: 9, typeWidth: 6, decoratorWidth: 10, hasPrivate: false });
      expect(result[1]).toEqual({ nameWidth: 9, typeWidth: 6, decoratorWidth: 10, hasPrivate: false });
      expect(result[2]).toEqual({ nameWidth: 9, typeWidth: 6, decoratorWidth: 10, hasPrivate: false });
    });

    it('should handle single field in block mode', () => {
      const fields = [field('x', 'Int', '')];
      const result = calculateColumnWidths(fields, config({ alignmentScope: 'block' }));
      expect(result).toEqual([{ nameWidth: 1, typeWidth: 3, decoratorWidth: 0, hasPrivate: false }]);
    });
  });

  describe('all fields same width', () => {
    it('should return identical widths when all names and types match', () => {
      const fields = [field('foo', 'Int', '@id'), field('bar', 'Int', '@unique'), field('baz', 'Int', '')];
      const result = calculateColumnWidths(fields, config());

      expect(result[0]).toEqual({ nameWidth: 3, typeWidth: 3, decoratorWidth: 7, hasPrivate: false });
      expect(result[1]).toEqual({ nameWidth: 3, typeWidth: 3, decoratorWidth: 7, hasPrivate: false });
      expect(result[2]).toEqual({ nameWidth: 3, typeWidth: 3, decoratorWidth: 7, hasPrivate: false });
    });
  });

  describe('type modifiers affect width', () => {
    it('should account for ? and [] in type width', () => {
      const fields = [field('name', 'String', ''), field('tags', 'String[]', ''), field('age', 'Int?', '')];
      const result = calculateColumnWidths(fields, config());

      // typeWidth = max('String'.length=6, 'String[]'.length=8, 'Int?'.length=4) = 8
      expect(result[0]).toEqual({ nameWidth: 4, typeWidth: 8, decoratorWidth: 0, hasPrivate: false });
      expect(result[1]).toEqual({ nameWidth: 4, typeWidth: 8, decoratorWidth: 0, hasPrivate: false });
      expect(result[2]).toEqual({ nameWidth: 4, typeWidth: 8, decoratorWidth: 0, hasPrivate: false });
    });
  });
});

describe('alignFields', () => {
  const indent2 = '  ';

  describe('3-column aligned mode (default)', () => {
    it('should align name, type, and decorators in 3 columns', () => {
      const fields = [field('id', 'Record', '@id'), field('email', 'Email', '@unique')];
      const result = alignFields(fields, config(), indent2);

      expect(result[0]).toBe('  id     Record  @id');
      expect(result[1]).toBe('  email  Email   @unique');
    });

    it('should handle group alignment example from spec', () => {
      const fields = [
        field('id', 'Record', '@id', false),
        field('email', 'Email', '@unique', true),
        field('createdAt', 'Date', '@createdAt', false),
      ];
      const result = alignFields(fields, config({ alignmentScope: 'group' }), indent2);

      // Group 1: nameWidth=5, typeWidth=6
      expect(result[0]).toBe('  id     Record  @id');
      expect(result[1]).toBe('  email  Email   @unique');

      // Group 2: nameWidth=9, typeWidth=4
      expect(result[2]).toBe('  createdAt  Date  @createdAt');
    });

    it('should handle block alignment example from spec', () => {
      const fields = [
        field('id', 'Record', '@id', false),
        field('email', 'Email', '@unique', true),
        field('createdAt', 'Date', '@createdAt', false),
      ];
      const result = alignFields(fields, config({ alignmentScope: 'block' }), indent2);

      // Block: nameWidth=9, typeWidth=6
      expect(result[0]).toBe('  id         Record  @id');
      expect(result[1]).toBe('  email      Email   @unique');
      expect(result[2]).toBe('  createdAt  Date    @createdAt');
    });
  });

  describe('2-column compact mode', () => {
    it('should pad name but flow type+decorators together', () => {
      const fields = [field('id', 'Record', '@id'), field('email', 'Email', '@unique')];
      const result = alignFields(fields, config({ decoratorAlignment: 'compact' }), indent2);

      expect(result[0]).toBe('  id     Record @id');
      expect(result[1]).toBe('  email  Email @unique');
    });

    it('should still align name column in compact mode', () => {
      const fields = [field('x', 'Int', '@id'), field('longName', 'String', '@unique')];
      const result = alignFields(fields, config({ decoratorAlignment: 'compact' }), indent2);

      expect(result[0]).toBe('  x         Int @id');
      expect(result[1]).toBe('  longName  String @unique');
    });
  });

  describe('empty decorators', () => {
    it('should not leave trailing spaces when decoratorString is empty', () => {
      const fields = [field('id', 'Record', '@id'), field('name', 'String', ''), field('email', 'Email', '@unique')];
      const result = alignFields(fields, config(), indent2);

      expect(result[0]).toBe('  id     Record  @id');
      expect(result[1]).toBe('  name   String');
      expect(result[2]).toBe('  email  Email   @unique');
    });

    it('should not leave trailing spaces in compact mode', () => {
      const fields = [field('id', 'Record', '@id'), field('name', 'String', '')];
      const result = alignFields(fields, config({ decoratorAlignment: 'compact' }), indent2);

      expect(result[0]).toBe('  id    Record @id');
      expect(result[1]).toBe('  name  String');
    });

    it('should handle all fields with empty decorators', () => {
      const fields = [field('name', 'String', ''), field('age', 'Int', '')];
      const result = alignFields(fields, config(), indent2);

      expect(result[0]).toBe('  name  String');
      expect(result[1]).toBe('  age   Int');
    });
  });

  describe('trailing comments', () => {
    it('should append trailing comment after decorators', () => {
      const fields = [field('id', 'Record', '@id', false, '# primary key'), field('email', 'Email', '@unique')];
      const result = alignFields(fields, config(), indent2);

      expect(result[0]).toBe('  id     Record  @id # primary key');
      expect(result[1]).toBe('  email  Email   @unique');
    });

    it('should append trailing comment after type when no decorators', () => {
      const fields = [field('name', 'String', '', false, '# important')];
      const result = alignFields(fields, config(), indent2);

      expect(result[0]).toBe('  name  String # important');
    });

    it('should append trailing comment in compact mode', () => {
      const fields = [field('id', 'Record', '@id', false, '# key'), field('name', 'String', '')];
      const result = alignFields(fields, config({ decoratorAlignment: 'compact' }), indent2);

      expect(result[0]).toBe('  id    Record @id # key');
      expect(result[1]).toBe('  name  String');
    });
  });

  describe('indentation', () => {
    it('should use 2-space indent', () => {
      const fields = [field('id', 'Record', '@id')];
      const result = alignFields(fields, config(), '  ');
      expect(result[0]).toBe('  id  Record  @id');
    });

    it('should use 4-space indent', () => {
      const fields = [field('id', 'Record', '@id')];
      const result = alignFields(fields, config(), '    ');
      expect(result[0]).toBe('    id  Record  @id');
    });

    it('should use tab indent', () => {
      const fields = [field('id', 'Record', '@id')];
      const result = alignFields(fields, config(), '\t');
      expect(result[0]).toBe('\tid  Record  @id');
    });
  });

  describe('empty input', () => {
    it('should return empty array for no fields', () => {
      const result = alignFields([], config(), indent2);
      expect(result).toEqual([]);
    });
  });

  describe('single field', () => {
    it('should format single field without extra padding', () => {
      const fields = [field('id', 'Record', '@id')];
      const result = alignFields(fields, config(), indent2);
      expect(result[0]).toBe('  id  Record  @id');
    });

    it('should format single field with no decorators', () => {
      const fields = [field('name', 'String', '')];
      const result = alignFields(fields, config(), indent2);
      expect(result[0]).toBe('  name  String');
    });
  });

  describe('mixed group sizes', () => {
    it('should align each group independently', () => {
      const fields = [
        // Group 1: 3 fields
        field('id', 'Record', '@id', false),
        field('email', 'Email', '@unique', false),
        field('name', 'String', '', true), // group boundary

        // Group 2: 1 field
        field('createdAt', 'Date', '@createdAt', true), // group boundary

        // Group 3: 2 fields
        field('posts', 'Relation[]', '', false),
        field('comments', 'Relation[]', '@model(Comment)', false),
      ];
      const result = alignFields(fields, config({ alignmentScope: 'group' }), indent2);

      // Group 1: nameWidth=5 (email), typeWidth=6 (Record/String)
      expect(result[0]).toBe('  id     Record  @id');
      expect(result[1]).toBe('  email  Email   @unique');
      expect(result[2]).toBe('  name   String');

      // Group 2: nameWidth=9 (createdAt), typeWidth=4 (Date)
      expect(result[3]).toBe('  createdAt  Date  @createdAt');

      // Group 3: nameWidth=8 (comments), typeWidth=10 (Relation[])
      expect(result[4]).toBe('  posts     Relation[]');
      expect(result[5]).toBe('  comments  Relation[]  @model(Comment)');
    });
  });

  describe('realistic model fields', () => {
    it('should format a typical model correctly in aligned mode', () => {
      const fields = [
        field('id', 'Record', '@id', false),
        field('email', 'Email', '@unique', false),
        field('name', 'String', '', false),
        field('age', 'Int?', '', false),
        field('role', 'Role', '@default(Viewer)', false),
        field('isActive', 'Bool', '@default(true)', true),

        field('createdAt', 'Date', '@createdAt', false),
        field('updatedAt', 'Date', '@updatedAt', false),
      ];
      const result = alignFields(fields, config({ alignmentScope: 'group' }), indent2);

      // Group 1: nameWidth=8 (isActive), typeWidth=6 (Record/String)
      expect(result[0]).toBe('  id        Record  @id');
      expect(result[1]).toBe('  email     Email   @unique');
      expect(result[2]).toBe('  name      String');
      expect(result[3]).toBe('  age       Int?');
      expect(result[4]).toBe('  role      Role    @default(Viewer)');
      expect(result[5]).toBe('  isActive  Bool    @default(true)');

      // Group 2: nameWidth=9 (updatedAt), typeWidth=4 (Date)
      expect(result[6]).toBe('  createdAt  Date  @createdAt');
      expect(result[7]).toBe('  updatedAt  Date  @updatedAt');
    });

    it('should format the same model in compact mode', () => {
      const fields = [
        field('id', 'Record', '@id', false),
        field('email', 'Email', '@unique', false),
        field('name', 'String', '', false),
        field('isActive', 'Bool', '@default(true)', false),
      ];
      const result = alignFields(fields, config({ decoratorAlignment: 'compact' }), indent2);

      expect(result[0]).toBe('  id        Record @id');
      expect(result[1]).toBe('  email     Email @unique');
      expect(result[2]).toBe('  name      String');
      expect(result[3]).toBe('  isActive  Bool @default(true)');
    });
  });

  describe('complex decorator strings', () => {
    it('should handle multi-decorator strings', () => {
      const fields = [
        field('authorId', 'Record', '', false),
        field('author', 'Relation', '@field(authorId) @model(User)', false),
      ];
      const result = alignFields(fields, config(), indent2);

      expect(result[0]).toBe('  authorId  Record');
      expect(result[1]).toBe('  author    Relation  @field(authorId) @model(User)');
    });
  });
});
