/**
 * Unit Tests: Object Parser
 *
 * Tests parsing of `object {}` blocks, including basic parsing,
 * nesting/cross-references, and validation errors.
 */

import { describe, expect, test } from 'bun:test';
import { parse, validateSchema, collectObjectNames } from '../../../src/parser/parser';

describe('Object Parser', () => {
  describe('basic parsing', () => {
    test('should parse object with two string fields', () => {
      const schema = `
object Address {
  street String
  city String
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.objects).toHaveLength(1);

      const addr = ast.objects[0]!;
      expect(addr.name).toBe('Address');
      expect(addr.fields).toHaveLength(2);
      expect(addr.fields[0]!.name).toBe('street');
      expect(addr.fields[0]!.type).toBe('string');
      expect(addr.fields[1]!.name).toBe('city');
      expect(addr.fields[1]!.type).toBe('string');
    });

    test('should parse object with optional field', () => {
      const schema = `
object Address {
  street String
  zipCode String?
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const zip = ast.objects[0]!.fields.find((f) => f.name === 'zipCode')!;
      expect(zip.isOptional).toBe(true);
      expect(zip.type).toBe('string');
    });

    test('should parse object with array field', () => {
      const schema = `
object Tags {
  items String[]
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const items = ast.objects[0]!.fields[0]!;
      expect(items.name).toBe('items');
      expect(items.isArray).toBe(true);
      expect(items.type).toBe('string');
    });

    test('should parse object with multiple field types', () => {
      const schema = `
object AllTypes {
  label String
  count Int
  score Float
  active Bool
  created Date
  contact Email
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const obj = ast.objects[0]!;
      expect(obj.fields).toHaveLength(6);
      expect(obj.fields[0]!.type).toBe('string');
      expect(obj.fields[1]!.type).toBe('int');
      expect(obj.fields[2]!.type).toBe('float');
      expect(obj.fields[3]!.type).toBe('bool');
      expect(obj.fields[4]!.type).toBe('date');
      expect(obj.fields[5]!.type).toBe('email');
    });

    test('should parse object with Record field', () => {
      const schema = `
object Ref {
  refId Record
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const field = ast.objects[0]!.fields[0]!;
      expect(field.name).toBe('refId');
      expect(field.type).toBe('record');
    });

    test('should parse object with optional Record field', () => {
      const schema = `
object Ref {
  refId Record?
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const field = ast.objects[0]!.fields[0]!;
      expect(field.type).toBe('record');
      expect(field.isOptional).toBe(true);
    });

    test('should parse object with Record array field', () => {
      const schema = `
object Ref {
  refIds Record[]
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const field = ast.objects[0]!.fields[0]!;
      expect(field.type).toBe('record');
      expect(field.isArray).toBe(true);
    });

    test('should parse empty object', () => {
      const schema = `
object Empty {
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.objects).toHaveLength(1);
      expect(ast.objects[0]!.name).toBe('Empty');
      expect(ast.objects[0]!.fields).toHaveLength(0);
    });
  });

  describe('nesting', () => {
    test('should parse object referencing another object', () => {
      const schema = `
object Address {
  street String
  city String
}

object Location {
  label Address
  lat Float
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.objects).toHaveLength(2);

      const labelField = ast.objects[1]!.fields.find((f) => f.name === 'label')!;
      expect(labelField.type).toBe('object');
      expect(labelField.objectName).toBe('Address');
    });

    test('should parse object with optional object reference', () => {
      const schema = `
object Address {
  street String
}

object Location {
  label Address?
  lat Float
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const labelField = ast.objects[1]!.fields.find((f) => f.name === 'label')!;
      expect(labelField.type).toBe('object');
      expect(labelField.objectName).toBe('Address');
      expect(labelField.isOptional).toBe(true);
    });

    test('should parse object with array of objects', () => {
      const schema = `
object GeoPoint {
  lat Float
  lng Float
}

object Route {
  points GeoPoint[]
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const pointsField = ast.objects[1]!.fields.find((f) => f.name === 'points')!;
      expect(pointsField.type).toBe('object');
      expect(pointsField.objectName).toBe('GeoPoint');
      expect(pointsField.isArray).toBe(true);
    });

    test('should parse self-referencing object with array', () => {
      const schema = `
object TreeNode {
  value Int
  children TreeNode[]
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const childrenField = ast.objects[0]!.fields.find((f) => f.name === 'children')!;
      expect(childrenField.type).toBe('object');
      expect(childrenField.objectName).toBe('TreeNode');
      expect(childrenField.isArray).toBe(true);
    });

    test('should parse self-referencing object with optional field', () => {
      const schema = `
object TreeNode {
  value Int
  parent TreeNode?
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const parentField = ast.objects[0]!.fields.find((f) => f.name === 'parent')!;
      expect(parentField.type).toBe('object');
      expect(parentField.objectName).toBe('TreeNode');
      expect(parentField.isOptional).toBe(true);
    });

    test('should parse object defined AFTER model that references it (forward reference)', () => {
      const schema = `
model User {
  id Record @id
  name String
  address Address
}

object Address {
  street String
  city String
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.models).toHaveLength(1);
      expect(ast.objects).toHaveLength(1);

      const addrField = ast.models[0]!.fields.find((f) => f.name === 'address')!;
      expect(addrField.type).toBe('object');
      expect(addrField.objectName).toBe('Address');
    });

    test('should parse object defined BEFORE model that references it', () => {
      const schema = `
object Address {
  street String
  city String
}

model User {
  id Record @id
  name String
  address Address
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const addrField = ast.models[0]!.fields.find((f) => f.name === 'address')!;
      expect(addrField.type).toBe('object');
      expect(addrField.objectName).toBe('Address');
    });

    test('should parse object referencing object defined later in same file', () => {
      const schema = `
object Location {
  lat Float
  label Address
}

object Address {
  street String
  city String
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.objects).toHaveLength(2);

      const labelField = ast.objects[0]!.fields.find((f) => f.name === 'label')!;
      expect(labelField.type).toBe('object');
      expect(labelField.objectName).toBe('Address');
    });

    test('should parse object referencing object from external names (cross-file)', () => {
      const externalNames = new Set(['ExternalObj']);
      const schema = `
object Local {
  ref ExternalObj
}
`;
      const { ast, errors } = parse(schema, externalNames);
      expect(errors).toHaveLength(0);

      const refField = ast.objects[0]!.fields.find((f) => f.name === 'ref')!;
      expect(refField.type).toBe('object');
      expect(refField.objectName).toBe('ExternalObj');
    });
  });

  describe('validation errors', () => {
    test('should error on object with id field', () => {
      const schema = `
object Bad {
  id Record @id
  name String
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.some((e) => e.message.includes("Objects cannot have an 'id' field"))).toBe(true);
    });

    test('should error on object with @id decorator', () => {
      const schema = `
object Bad {
  myId Record @id
  name String
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.some((e) => e.message.includes('Decorator @id is not allowed on object fields'))).toBe(true);
    });

    test('should error on object with Relation field', () => {
      const schema = `
model User {
  id Record @id
}

object Bad {
  user Relation @model(User)
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.some((e) => e.message.includes('Objects cannot have Relation fields'))).toBe(true);
    });

    test('should error on object with @field decorator (disallowed)', () => {
      const schema = `
object Bad {
  name String @field(something)
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(
        errors.some((e) => e.message.includes('@field') && e.message.includes('not allowed on object fields')),
      ).toBe(true);
    });

    test('should error on object with @id decorator (disallowed)', () => {
      const schema = `
object Bad {
  ref Record @id
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.some((e) => e.message.includes('@id') && e.message.includes('not allowed on object fields'))).toBe(
        true,
      );
    });

    test('should error on object with @model decorator (disallowed)', () => {
      const schema = `
object Bad {
  name String @model(User)
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(
        errors.some((e) => e.message.includes('@model') && e.message.includes('not allowed on object fields')),
      ).toBe(true);
    });

    test('should error on object with @key decorator (disallowed)', () => {
      const schema = `
object Bad {
  name String @key(something)
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.some((e) => e.message.includes('@key') && e.message.includes('not allowed on object fields'))).toBe(
        true,
      );
    });

    test('should error on object with @onDelete decorator (disallowed)', () => {
      const schema = `
object Bad {
  name String @onDelete(Cascade)
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(
        errors.some((e) => e.message.includes('@onDelete') && e.message.includes('not allowed on object fields')),
      ).toBe(true);
    });

    // Allowed decorators on object fields
    test('should allow @unique on object fields', () => {
      const schema = `
object Address {
  zip String @unique
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.filter((e) => e.message.includes('not allowed'))).toHaveLength(0);
    });

    test('should allow @index on object fields', () => {
      const schema = `
object Address {
  city String @index
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.filter((e) => e.message.includes('not allowed'))).toHaveLength(0);
    });

    test('should allow @default on object fields', () => {
      const schema = `
object Address {
  city String @default("Unknown")
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.filter((e) => e.message.includes('not allowed'))).toHaveLength(0);
    });

    test('should allow @now on object Date fields', () => {
      const schema = `
object Metadata {
  createdAt Date @now
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.filter((e) => e.message.includes('not allowed'))).toHaveLength(0);
    });

    test('should allow @distinct and @sort on array fields in objects', () => {
      const schema = `
object Tags {
  values String[] @distinct @sort
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.filter((e) => e.message.includes('not allowed'))).toHaveLength(0);
    });

    // Validation rules for allowed decorators
    test('should error on @index and @unique on same object field', () => {
      const schema = `
object Address {
  zip String @index @unique
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.some((e) => e.message.includes('@index') && e.message.includes('@unique'))).toBe(true);
    });

    test('should error on @unique on array field in object', () => {
      const schema = `
object Tags {
  values String[] @unique
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.some((e) => e.message.includes('array') && e.message.includes('@unique'))).toBe(true);
    });

    test('should error on @distinct on non-array field in object', () => {
      const schema = `
object Address {
  city String @distinct
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.some((e) => e.message.includes('distinct') && e.message.includes('array'))).toBe(true);
    });

    test('should error on @sort on non-array field in object', () => {
      const schema = `
object Address {
  city String @sort
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.some((e) => e.message.includes('sort') && e.message.includes('array'))).toBe(true);
    });

    test('should error on duplicate object name', () => {
      const schema = `
object Address {
  street String
}

object Address {
  city String
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.some((e) => e.message.includes('Duplicate object name: Address'))).toBe(true);
    });

    test('should error on object name same as model name', () => {
      const schema = `
model User {
  id Record @id
  name String
}

object User {
  street String
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.some((e) => e.message.includes("Object name 'User' conflicts with model name"))).toBe(true);
    });

    test('should error on required self-referencing field', () => {
      const schema = `
object TreeNode {
  value Int
  self TreeNode
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.some((e) => e.message.includes('Self-referencing object fields must be optional or array'))).toBe(
        true,
      );
    });

    test('should error on duplicate field name within object', () => {
      const schema = `
object Bad {
  name String
  name String
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.some((e) => e.message.includes("Duplicate field name 'name' in object Bad"))).toBe(true);
    });
  });

  describe('collectObjectNames', () => {
    test('should collect object names from source', () => {
      const source = `
object Address {
  street String
}

model User {
  id Record @id
}

object GeoPoint {
  lat Float
}
`;
      const names = collectObjectNames(source);
      expect(names.has('Address')).toBe(true);
      expect(names.has('GeoPoint')).toBe(true);
      expect(names.has('User')).toBe(false);
    });
  });

  describe('models and objects coexistence', () => {
    test('should parse both models and objects', () => {
      const schema = `
object Address {
  street String
  city String
}

model User {
  id Record @id
  name String
  address Address
}

model Order {
  id Record @id
  billingAddress Address
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.objects).toHaveLength(1);
      expect(ast.models).toHaveLength(2);

      // Both models reference Address
      const userAddr = ast.models[0]!.fields.find((f) => f.name === 'address')!;
      expect(userAddr.type).toBe('object');
      expect(userAddr.objectName).toBe('Address');

      const orderAddr = ast.models[1]!.fields.find((f) => f.name === 'billingAddress')!;
      expect(orderAddr.type).toBe('object');
      expect(orderAddr.objectName).toBe('Address');
    });
  });
});
