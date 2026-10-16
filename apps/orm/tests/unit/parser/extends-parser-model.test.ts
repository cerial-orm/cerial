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
});
