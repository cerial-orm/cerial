/**
 * Unit Tests: Extends/Abstract Parser
 *
 * Tests parsing of `abstract model`, `extends`, pick/omit bracket syntax
 * across all type kinds (model, object, tuple, enum, literal).
 */

import { describe, expect, test } from 'bun:test';
import { parse } from '../../../src/parser/parser';
import {
  extractModelName,
  isMixedPickOmit,
  isModelDeclaration,
  parseExtendsBracket,
  parseModelDeclaration,
} from '../../../src/parser/types/model/model-declaration-parser';

describe('Extends Parser', () => {
  // ──────────────────────────────────────────────
  // A. Model Declaration Parser (model-declaration-parser.ts)
  // ──────────────────────────────────────────────
  describe('extractModelName', () => {
    test('should extract name from plain model', () => {
      expect(extractModelName('model User {')).toBe('User');
    });

    test('should extract name from abstract model', () => {
      expect(extractModelName('abstract model Base {')).toBe('Base');
    });

    test('should extract name from model extends', () => {
      expect(extractModelName('model User extends Base {')).toBe('User');
    });

    test('should extract name from model extends with pick', () => {
      expect(extractModelName('model User extends Base[id, name] {')).toBe('User');
    });

    test('should extract name from model extends with omit', () => {
      expect(extractModelName('model User extends Base[!updatedAt] {')).toBe('User');
    });

    test('should extract name from abstract model extends', () => {
      expect(extractModelName('abstract model Mid extends Base {')).toBe('Mid');
    });

    test('should extract name from abstract model extends with pick', () => {
      expect(extractModelName('abstract model Mid extends Base[id] {')).toBe('Mid');
    });

    test('should return null for invalid declaration', () => {
      expect(extractModelName('invalid line')).toBeNull();
    });

    test('should return null for empty string', () => {
      expect(extractModelName('')).toBeNull();
    });
  });

  describe('isModelDeclaration', () => {
    test('should return true for plain model', () => {
      expect(isModelDeclaration('model User {')).toBe(true);
    });

    test('should return true for abstract model', () => {
      expect(isModelDeclaration('abstract model Base {')).toBe(true);
    });

    test('should return true for model extends', () => {
      expect(isModelDeclaration('model User extends Base {')).toBe(true);
    });

    test('should return true for abstract model extends with pick', () => {
      expect(isModelDeclaration('abstract model Mid extends Base[id] {')).toBe(true);
    });

    test('should return false for non-model lines', () => {
      expect(isModelDeclaration('object Addr {')).toBe(false);
      expect(isModelDeclaration('tuple Point {')).toBe(false);
      expect(isModelDeclaration('some random text')).toBe(false);
    });
  });

  describe('parseModelDeclaration', () => {
    test('should parse plain model', () => {
      const result = parseModelDeclaration('model User {');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('User');
      expect(result!.tableName).toBe('user');
      expect(result!.abstract).toBeUndefined();
      expect(result!.extends_).toBeUndefined();
      expect(result!.extendsFilter).toBeUndefined();
    });

    test('should parse abstract model', () => {
      const result = parseModelDeclaration('abstract model Base {');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Base');
      expect(result!.abstract).toBe(true);
    });

    test('should parse model extends', () => {
      const result = parseModelDeclaration('model User extends Base {');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('User');
      expect(result!.extends_).toBe('Base');
      expect(result!.extendsFilter).toBeUndefined();
    });

    test('should parse model extends with pick', () => {
      const result = parseModelDeclaration('model User extends Base[id, name] {');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('User');
      expect(result!.extends_).toBe('Base');
      expect(result!.extendsFilter).toEqual({ mode: 'pick', fields: ['id', 'name'] });
    });

    test('should parse model extends with omit', () => {
      const result = parseModelDeclaration('model User extends Base[!updatedAt, !createdAt] {');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('User');
      expect(result!.extends_).toBe('Base');
      expect(result!.extendsFilter).toEqual({ mode: 'omit', fields: ['updatedAt', 'createdAt'] });
    });

    test('should parse model extends with single pick', () => {
      const result = parseModelDeclaration('model Slim extends Base[id] {');
      expect(result).not.toBeNull();
      expect(result!.extends_).toBe('Base');
      expect(result!.extendsFilter).toEqual({ mode: 'pick', fields: ['id'] });
    });

    test('should parse model extends with single omit', () => {
      const result = parseModelDeclaration('model User extends Base[!secret] {');
      expect(result).not.toBeNull();
      expect(result!.extends_).toBe('Base');
      expect(result!.extendsFilter).toEqual({ mode: 'omit', fields: ['secret'] });
    });

    test('should parse abstract model extends', () => {
      const result = parseModelDeclaration('abstract model Mid extends Base {');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Mid');
      expect(result!.abstract).toBe(true);
      expect(result!.extends_).toBe('Base');
    });

    test('should parse abstract model extends with pick', () => {
      const result = parseModelDeclaration('abstract model Mid extends Base[id, name] {');
      expect(result).not.toBeNull();
      expect(result!.abstract).toBe(true);
      expect(result!.extends_).toBe('Base');
      expect(result!.extendsFilter).toEqual({ mode: 'pick', fields: ['id', 'name'] });
    });
  });

  // ──────────────────────────────────────────────
  // B. Block detection in parser.ts
  // ──────────────────────────────────────────────
  describe('collectNames', () => {
    test('should collect abstract model name', () => {
      const schema = `
abstract model Base {
  id Record @id
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.models).toHaveLength(1);
      expect(ast.models[0]!.name).toBe('Base');
    });

    test('should collect model with extends', () => {
      const schema = `
abstract model Base {
  id Record @id
}

model User extends Base {
  name String
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.models).toHaveLength(2);
      expect(ast.models[0]!.name).toBe('Base');
      expect(ast.models[1]!.name).toBe('User');
    });

    test('should collect model name with extends and pick bracket', () => {
      const schema = `
abstract model Base {
  id Record @id
  name String
  email Email
}

model Slim extends Base[id, name] {
  age Int
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.models).toHaveLength(2);
      expect(ast.models[1]!.name).toBe('Slim');
    });
  });

  // ──────────────────────────────────────────────
  // C. Full model parse integration
  // ──────────────────────────────────────────────
  describe('model parse integration', () => {
    test('should parse abstract model with abstract flag', () => {
      const schema = `
abstract model BaseEntity {
  id Record @id
  createdAt Date @createdAt
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.models).toHaveLength(1);

      const model = ast.models[0]!;
      expect(model.name).toBe('BaseEntity');
      expect(model.abstract).toBe(true);
      expect(model.extends).toBeUndefined();
      expect(model.extendsFilter).toBeUndefined();
      expect(model.fields).toHaveLength(2);
    });

    test('should parse model extending another', () => {
      const schema = `
abstract model Base {
  id Record @id
}

model User extends Base {
  name String
  email Email
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.models).toHaveLength(2);

      const user = ast.models[1]!;
      expect(user.name).toBe('User');
      expect(user.abstract).toBeUndefined();
      expect(user.extends).toBe('Base');
      expect(user.extendsFilter).toBeUndefined();
      expect(user.fields).toHaveLength(2);
      expect(user.fields[0]!.name).toBe('name');
      expect(user.fields[1]!.name).toBe('email');
    });

    test('should parse model extends with pick filter', () => {
      const schema = `
abstract model Base {
  id Record @id
  name String
  email Email
  createdAt Date @createdAt
}

model Slim extends Base[id, name] {
  age Int
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const slim = ast.models[1]!;
      expect(slim.name).toBe('Slim');
      expect(slim.extends).toBe('Base');
      expect(slim.extendsFilter).toEqual({ mode: 'pick', fields: ['id', 'name'] });
      expect(slim.fields).toHaveLength(1);
      expect(slim.fields[0]!.name).toBe('age');
    });

    test('should parse model extends with omit filter', () => {
      const schema = `
abstract model Base {
  id Record @id
  name String
  secret String
}

model Safe extends Base[!secret] {
  role String
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const safe = ast.models[1]!;
      expect(safe.extends).toBe('Base');
      expect(safe.extendsFilter).toEqual({ mode: 'omit', fields: ['secret'] });
    });

    test('should parse abstract model extending another', () => {
      const schema = `
abstract model L1 {
  id Record @id
}

abstract model L2 extends L1 {
  name String
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const l2 = ast.models[1]!;
      expect(l2.abstract).toBe(true);
      expect(l2.extends).toBe('L1');
    });

    test('should parse concrete model extending abstract with omit', () => {
      const schema = `
abstract model Base {
  id Record @id
  createdAt Date @createdAt
  updatedAt Date @updatedAt
}

model Light extends Base[!updatedAt] {
  title String
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const light = ast.models[1]!;
      expect(light.extends).toBe('Base');
      expect(light.extendsFilter).toEqual({ mode: 'omit', fields: ['updatedAt'] });
      expect(light.fields).toHaveLength(1);
    });

    test('should preserve model fields after extends declaration', () => {
      const schema = `
abstract model Base {
  id Record @id
}

model User extends Base {
  name String
  email Email @unique
  age Int?
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const user = ast.models[1]!;
      expect(user.fields).toHaveLength(3);
      expect(user.fields[0]!.name).toBe('name');
      expect(user.fields[1]!.name).toBe('email');
      expect(user.fields[1]!.decorators.some((d) => d.type === 'unique')).toBe(true);
      expect(user.fields[2]!.name).toBe('age');
      expect(user.fields[2]!.isOptional).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // D. Object extends parsing
  // ──────────────────────────────────────────────
  describe('object extends', () => {
    test('should parse object with extends', () => {
      const schema = `
object BaseAddr {
  street String
  city String
}

object FullAddr extends BaseAddr {
  zip String
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.objects).toHaveLength(2);

      const full = ast.objects[1]!;
      expect(full.name).toBe('FullAddr');
      expect(full.extends).toBe('BaseAddr');
      expect(full.extendsFilter).toBeUndefined();
      expect(full.fields).toHaveLength(1);
      expect(full.fields[0]!.name).toBe('zip');
    });

    test('should parse object with extends and pick', () => {
      const schema = `
object BaseAddr {
  street String
  city String
  country String
}

object CityOnly extends BaseAddr[city] {
  zip String
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const city = ast.objects[1]!;
      expect(city.extends).toBe('BaseAddr');
      expect(city.extendsFilter).toEqual({ mode: 'pick', fields: ['city'] });
    });

    test('should parse object with extends and omit', () => {
      const schema = `
object BaseAddr {
  street String
  city String
  country String
}

object NoCountry extends BaseAddr[!country] {
  zip String
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const nc = ast.objects[1]!;
      expect(nc.extends).toBe('BaseAddr');
      expect(nc.extendsFilter).toEqual({ mode: 'omit', fields: ['country'] });
    });

    test('should extract object name with extends clause', () => {
      const schema = `
object Base {
  x Int
}

object Child extends Base {
  y Int
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.objects).toHaveLength(2);
      expect(ast.objects[1]!.name).toBe('Child');
    });

    test('should parse object with extends and empty brackets', () => {
      const schema = `
object BaseAddr {
  street String
  city String
}

object EmptyPick extends BaseAddr[] {
  zip String
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const ep = ast.objects[1]!;
      expect(ep.name).toBe('EmptyPick');
      expect(ep.extends).toBe('BaseAddr');
      expect(ep.extendsFilter).toEqual({ mode: 'pick', fields: [] });
    });
  });

  // ──────────────────────────────────────────────
  // E. Tuple extends parsing
  // ──────────────────────────────────────────────
  describe('tuple extends', () => {
    test('should parse tuple with extends', () => {
      const schema = `
tuple Pair {
  Float, Float
}

tuple Triple extends Pair {
  Float
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.tuples).toHaveLength(2);

      const triple = ast.tuples[1]!;
      expect(triple.name).toBe('Triple');
      expect(triple.extends).toBe('Pair');
      expect(triple.extendsFilter).toBeUndefined();
      expect(triple.elements).toHaveLength(1);
    });

    test('should parse tuple with extends and pick', () => {
      const schema = `
tuple Triple {
  Float, Float, Float
}

tuple FirstTwo extends Triple[0, 1] {
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const ft = ast.tuples[1]!;
      expect(ft.extends).toBe('Triple');
      expect(ft.extendsFilter).toEqual({ mode: 'pick', fields: ['0', '1'] });
    });

    test('should parse tuple with extends and omit', () => {
      const schema = `
tuple Triple {
  Float, Float, Float
}

tuple WithoutSecond extends Triple[!1] {
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const ws = ast.tuples[1]!;
      expect(ws.extends).toBe('Triple');
      expect(ws.extendsFilter).toEqual({ mode: 'omit', fields: ['1'] });
    });

    test('should extract tuple name with extends clause', () => {
      const schema = `
tuple Base { Int, Int }

tuple Child extends Base { String }
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.tuples).toHaveLength(2);
      expect(ast.tuples[1]!.name).toBe('Child');
    });

    test('should parse tuple with extends and empty brackets', () => {
      const schema = `
tuple Pair {
  Float, Float
}

tuple EmptyPick extends Pair[] {
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const ep = ast.tuples[1]!;
      expect(ep.name).toBe('EmptyPick');
      expect(ep.extends).toBe('Pair');
      expect(ep.extendsFilter).toEqual({ mode: 'pick', fields: [] });
    });
  });

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

  // ──────────────────────────────────────────────
  // H0. parseExtendsBracket unit tests
  // ──────────────────────────────────────────────
  describe('parseExtendsBracket', () => {
    test('should return empty pick filter for empty string', () => {
      expect(parseExtendsBracket('')).toEqual({ mode: 'pick', fields: [] });
    });

    test('should return empty pick filter for whitespace-only string', () => {
      expect(parseExtendsBracket('  ')).toEqual({ mode: 'pick', fields: [] });
    });

    test('should return pick filter for single field', () => {
      expect(parseExtendsBracket('id')).toEqual({ mode: 'pick', fields: ['id'] });
    });

    test('should return omit filter for single omit field', () => {
      expect(parseExtendsBracket('!id')).toEqual({ mode: 'omit', fields: ['id'] });
    });

    test('should return pick filter for multiple fields', () => {
      expect(parseExtendsBracket('id, name')).toEqual({ mode: 'pick', fields: ['id', 'name'] });
    });

    test('should return undefined for mixed pick/omit', () => {
      expect(parseExtendsBracket('id, !name')).toBeUndefined();
    });

    describe('isMixedPickOmit', () => {
      test('should return false for empty string', () => {
        expect(isMixedPickOmit('')).toBe(false);
      });

      test('should return false for pick-only items', () => {
        expect(isMixedPickOmit('id, name')).toBe(false);
      });

      test('should return false for omit-only items', () => {
        expect(isMixedPickOmit('!id, !name')).toBe(false);
      });

      test('should return true for mixed pick and omit', () => {
        expect(isMixedPickOmit('id, !name')).toBe(true);
      });

      test('should return true for mixed omit and pick', () => {
        expect(isMixedPickOmit('!id, name')).toBe(true);
      });

      test('should return true for multiple mixed items', () => {
        expect(isMixedPickOmit('id, name, !secret, !password')).toBe(true);
      });
    });
  });

  // ──────────────────────────────────────────────
  // H. Pick/Omit bracket edge cases
  // ──────────────────────────────────────────────
  describe('bracket parsing edge cases', () => {
    test('should handle spaces in bracket list', () => {
      const result = parseModelDeclaration('model X extends Base[ id , name , email ] {');
      expect(result).not.toBeNull();
      expect(result!.extendsFilter).toEqual({ mode: 'pick', fields: ['id', 'name', 'email'] });
    });

    test('should handle spaces in omit bracket list', () => {
      const result = parseModelDeclaration('model X extends Base[ !id , !name ] {');
      expect(result).not.toBeNull();
      expect(result!.extendsFilter).toEqual({ mode: 'omit', fields: ['id', 'name'] });
    });

    test('should handle extends without brackets', () => {
      const result = parseModelDeclaration('model X extends Base {');
      expect(result).not.toBeNull();
      expect(result!.extends_).toBe('Base');
      expect(result!.extendsFilter).toBeUndefined();
    });

    test('should parse empty brackets as empty pick filter', () => {
      const result = parseModelDeclaration('model X extends Y[] {');
      expect(result).not.toBeNull();
      expect(result!.extends_).toBe('Y');
      expect(result!.extendsFilter).toEqual({ mode: 'pick', fields: [] });
    });

    test('should parse whitespace-only brackets as empty pick filter', () => {
      const result = parseModelDeclaration('model X extends Y[  ] {');
      expect(result).not.toBeNull();
      expect(result!.extends_).toBe('Y');
      expect(result!.extendsFilter).toEqual({ mode: 'pick', fields: [] });
    });

    test('should handle multi-level chain parsing', () => {
      const schema = `
abstract model L1 {
  id Record @id
}

abstract model L2 extends L1 {
  name String
}

model L3 extends L2 {
  email Email
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.models).toHaveLength(3);
      expect(ast.models[0]!.abstract).toBe(true);
      expect(ast.models[1]!.abstract).toBe(true);
      expect(ast.models[1]!.extends).toBe('L1');
      expect(ast.models[2]!.abstract).toBeUndefined();
      expect(ast.models[2]!.extends).toBe('L2');
    });
  });

  // ──────────────────────────────────────────────
  // I. Cross-kind: models using objects with extends
  // ──────────────────────────────────────────────
  describe('cross-kind interaction', () => {
    test('should parse model with extends and object field', () => {
      const schema = `
object Address {
  street String
  city String
}

abstract model Base {
  id Record @id
}

model User extends Base {
  name String
  address Address
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.models).toHaveLength(2);
      expect(ast.objects).toHaveLength(1);

      const user = ast.models[1]!;
      expect(user.extends).toBe('Base');
      expect(user.fields).toHaveLength(2);

      const addrField = user.fields.find((f) => f.name === 'address')!;
      expect(addrField.type).toBe('object');
      expect(addrField.objectName).toBe('Address');
    });

    test('should parse object extends with model referencing it', () => {
      const schema = `
object BaseAddr {
  street String
}

object FullAddr extends BaseAddr {
  city String
}

model User {
  id Record @id
  address FullAddr
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.objects).toHaveLength(2);
      expect(ast.objects[1]!.extends).toBe('BaseAddr');

      const user = ast.models[0]!;
      const addrField = user.fields.find((f) => f.name === 'address')!;
      expect(addrField.objectName).toBe('FullAddr');
    });
  });

  // ──────────────────────────────────────────────
  // J. Mixed pick/omit error detection
  // ──────────────────────────────────────────────
  describe('mixed pick/omit error detection', () => {
    test('should emit error for model with mixed pick/omit', () => {
      const schema = `
model Child extends Parent[field1, !field2] {
  name String
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Cannot mix pick and omit');
    });

    test('should emit error for object with mixed pick/omit', () => {
      const schema = `
object Child extends Parent[field1, !field2] {
  name String
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Cannot mix pick and omit');
    });

    test('should emit error for tuple with mixed pick/omit', () => {
      const schema = `
tuple Child extends Parent[0, !1] {
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Cannot mix pick and omit');
    });

    test('should emit error for literal with mixed pick/omit', () => {
      const schema = `
literal Child extends Parent['a', !'b'] {
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Cannot mix pick and omit');
    });

    test('should emit error for enum with mixed pick/omit', () => {
      const schema = `
enum Child extends Parent[A, !B] {
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Cannot mix pick and omit');
    });

    test('should NOT emit error for valid pick-only', () => {
      const schema = `
model Child extends Parent[field1, field2] {
  name String
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
    });

    test('should NOT emit error for valid omit-only', () => {
      const schema = `
model Child extends Parent[!field1, !field2] {
  name String
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
    });

    test('should NOT emit error for empty brackets', () => {
      const schema = `
model Child extends Parent[] {
  name String
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
    });
  });

  // ──────────────────────────────────────────────
  // K. Unmatched bracket error detection
  // ──────────────────────────────────────────────
  describe('unmatched bracket error detection', () => {
    // --- Model ---
    test('should emit error for model with unclosed bracket (extends Foo[)', () => {
      const schema = `
model Child extends Parent[ {
  name String
}
`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('Unclosed bracket'))).toBe(true);
    });

    test('should emit error for model with stray closing bracket (extends Foo])', () => {
      const schema = `
model Child extends Parent] {
  name String
}
`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('Unexpected ]'))).toBe(true);
    });

    test('should emit error for model with unclosed bracket containing fields', () => {
      const schema = `
model Child extends Parent[field1 {
  name String
}
`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('Unclosed bracket'))).toBe(true);
    });

    test('should NOT emit bracket error for valid model extends with brackets', () => {
      const schema = `
model Child extends Parent[field1, field2] {
  name String
}
`;
      const { errors } = parse(schema);
      expect(errors.every((e) => !e.message.includes('Unclosed bracket') && !e.message.includes('Unexpected ]'))).toBe(
        true,
      );
    });

    test('should NOT emit bracket error for model extends without brackets', () => {
      const schema = `
model Child extends Parent {
  name String
}
`;
      const { errors } = parse(schema);
      expect(errors.every((e) => !e.message.includes('Unclosed bracket') && !e.message.includes('Unexpected ]'))).toBe(
        true,
      );
    });

    // --- Object ---
    test('should emit error for object with unclosed bracket', () => {
      const schema = `
object Child extends Parent[ {
  name String
}
`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('Unclosed bracket'))).toBe(true);
    });

    test('should emit error for object with stray closing bracket', () => {
      const schema = `
object Child extends Parent] {
  name String
}
`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('Unexpected ]'))).toBe(true);
    });

    // --- Tuple ---
    test('should emit error for tuple with unclosed bracket', () => {
      const schema = `
tuple Child extends Parent[ {
  Int, Int
}
`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('Unclosed bracket'))).toBe(true);
    });

    test('should emit error for tuple with stray closing bracket', () => {
      const schema = `
tuple Child extends Parent] {
  Int, Int
}
`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('Unexpected ]'))).toBe(true);
    });

    // --- Literal ---
    test('should emit error for literal with unclosed bracket', () => {
      const schema = `
literal Child extends Parent[ {
  'a', 'b'
}
`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('Unclosed bracket'))).toBe(true);
    });

    test('should emit error for literal with stray closing bracket', () => {
      const schema = `
literal Child extends Parent] {
  'a', 'b'
}
`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('Unexpected ]'))).toBe(true);
    });

    // --- Enum ---
    test('should emit error for enum with unclosed bracket', () => {
      const schema = `
enum Child extends Parent[ {
  A
  B
}
`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('Unclosed bracket'))).toBe(true);
    });

    test('should emit error for enum with stray closing bracket', () => {
      const schema = `
enum Child extends Parent] {
  A
  B
}
`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('Unexpected ]'))).toBe(true);
    });
  });
});
