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
});
