/**
 * Unit Tests: Extends/Abstract Parser
 *
 * Tests parsing of `abstract model`, `extends`, pick/omit bracket syntax
 * across all type kinds (model, object, tuple, enum, literal).
 */

import { describe, expect, test } from 'bun:test';
import { parse } from '../../../src/parser/parser';

describe('Extends Parser', () => {
  // ──────────────────────────────────────────────
  // F. Enum extends parsing
  // ──────────────────────────────────────────────
  describe('enum extends', () => {
    test('should parse enum with extends', () => {
      const schema = `
enum BaseRole {
  Admin
  User
}

enum ExtRole extends BaseRole {
  Moderator
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.enums).toHaveLength(2);

      const ext = ast.enums[1]!;
      expect(ext.name).toBe('ExtRole');
      expect(ext.extends).toBe('BaseRole');
      expect(ext.extendsFilter).toBeUndefined();
      expect(ext.values).toHaveLength(1);
      expect(ext.values[0]).toBe('Moderator');
    });

    test('should parse enum with extends and pick', () => {
      const schema = `
enum AllRoles {
  Admin
  User
  Moderator
  Guest
}

enum CoreRoles extends AllRoles[Admin, User] {
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const core = ast.enums[1]!;
      expect(core.extends).toBe('AllRoles');
      expect(core.extendsFilter).toEqual({ mode: 'pick', fields: ['Admin', 'User'] });
    });

    test('should parse enum with extends and omit', () => {
      const schema = `
enum AllRoles {
  Admin
  User
  Moderator
  Guest
}

enum NonAdmin extends AllRoles[!Admin] {
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const na = ast.enums[1]!;
      expect(na.extends).toBe('AllRoles');
      expect(na.extendsFilter).toEqual({ mode: 'omit', fields: ['Admin'] });
    });

    test('should extract enum name with extends clause', () => {
      const schema = `
enum Base { A, B }

enum Child extends Base { C }
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.enums).toHaveLength(2);
      expect(ast.enums[1]!.name).toBe('Child');
    });

    test('should parse enum with extends and empty brackets', () => {
      const schema = `
enum BaseRole {
  Admin
  User
}

enum EmptyPick extends BaseRole[] {
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const ep = ast.enums[1]!;
      expect(ep.name).toBe('EmptyPick');
      expect(ep.extends).toBe('BaseRole');
      expect(ep.extendsFilter).toEqual({ mode: 'pick', fields: [] });
    });
  });

  // ──────────────────────────────────────────────
  // G. Literal extends parsing
  // ──────────────────────────────────────────────
  describe('literal extends', () => {
    test('should parse literal with extends', () => {
      const schema = `
literal BasePriority {
  'low', 'medium', 'high'
}

literal ExtPriority extends BasePriority {
  'critical'
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.literals).toHaveLength(2);

      const ext = ast.literals[1]!;
      expect(ext.name).toBe('ExtPriority');
      expect(ext.extends).toBe('BasePriority');
      expect(ext.extendsFilter).toBeUndefined();
      expect(ext.variants).toHaveLength(1);
      expect(ext.variants[0]!.kind).toBe('string');
    });

    test('should parse literal with extends and pick', () => {
      const schema = `
literal Priority {
  'low', 'medium', 'high', 'critical'
}

literal HighOnly extends Priority['high', 'critical'] {
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const hi = ast.literals[1]!;
      expect(hi.extends).toBe('Priority');
      // Bracket content preserves quotes from literal syntax
      expect(hi.extendsFilter).toEqual({ mode: 'pick', fields: ["'high'", "'critical'"] });
    });

    test('should parse literal with extends and omit', () => {
      const schema = `
literal Priority {
  'low', 'medium', 'high', 'critical'
}

literal NoCritical extends Priority[!'critical'] {
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const nc = ast.literals[1]!;
      expect(nc.extends).toBe('Priority');
      // Bracket content preserves quotes from literal syntax
      expect(nc.extendsFilter).toEqual({ mode: 'omit', fields: ["'critical'"] });
    });

    test('should extract literal name with extends clause', () => {
      const schema = `
literal Base { 'a', 'b' }

literal Child extends Base { 'c' }
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.literals).toHaveLength(2);
      expect(ast.literals[1]!.name).toBe('Child');
    });

    test('should parse literal with extends and empty brackets', () => {
      const schema = `
literal BasePriority {
  'low', 'medium', 'high'
}

literal EmptyPick extends BasePriority[] {
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const ep = ast.literals[1]!;
      expect(ep.name).toBe('EmptyPick');
      expect(ep.extends).toBe('BasePriority');
      expect(ep.extendsFilter).toEqual({ mode: 'pick', fields: [] });
    });
  });
});
