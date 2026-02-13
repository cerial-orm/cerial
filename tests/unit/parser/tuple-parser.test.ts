/**
 * Unit Tests: Tuple Parser
 *
 * Tests parsing of `tuple {}` blocks, including basic parsing,
 * nesting/cross-references, validation errors, and collectTupleNames.
 */

import { describe, expect, test } from 'bun:test';
import { parse, validateSchema, collectTupleNames } from '../../../src/parser/parser';

describe('Tuple Parser', () => {
  describe('basic parsing', () => {
    test('should parse tuple with two unnamed float elements', () => {
      const schema = `
tuple Coordinate {
  Float,
  Float
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.tuples).toHaveLength(1);

      const coord = ast.tuples[0]!;
      expect(coord.name).toBe('Coordinate');
      expect(coord.elements).toHaveLength(2);
      expect(coord.elements[0]!.type).toBe('float');
      expect(coord.elements[0]!.isOptional).toBe(false);
      expect(coord.elements[0]!.name).toBeUndefined();
      expect(coord.elements[1]!.type).toBe('float');
    });

    test('should parse tuple with named elements', () => {
      const schema = `
tuple Coordinate {
  lat Float,
  lng Float
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const coord = ast.tuples[0]!;
      expect(coord.elements).toHaveLength(2);
      expect(coord.elements[0]!.name).toBe('lat');
      expect(coord.elements[0]!.type).toBe('float');
      expect(coord.elements[1]!.name).toBe('lng');
      expect(coord.elements[1]!.type).toBe('float');
    });

    test('should parse tuple with mixed named and unnamed elements', () => {
      const schema = `
tuple Entry {
  name String,
  Int,
  Bool
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const entry = ast.tuples[0]!;
      expect(entry.elements).toHaveLength(3);
      expect(entry.elements[0]!.name).toBe('name');
      expect(entry.elements[0]!.type).toBe('string');
      expect(entry.elements[1]!.name).toBeUndefined();
      expect(entry.elements[1]!.type).toBe('int');
      expect(entry.elements[2]!.name).toBeUndefined();
      expect(entry.elements[2]!.type).toBe('bool');
    });

    test('should parse tuple with optional elements', () => {
      const schema = `
tuple MaybePoint {
  Float,
  Float?
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const t = ast.tuples[0]!;
      expect(t.elements[0]!.isOptional).toBe(false);
      expect(t.elements[1]!.isOptional).toBe(true);
    });

    test('should parse tuple with optional named element', () => {
      const schema = `
tuple MaybeCoord {
  lat Float,
  lng Float?
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const t = ast.tuples[0]!;
      expect(t.elements[0]!.name).toBe('lat');
      expect(t.elements[0]!.isOptional).toBe(false);
      expect(t.elements[1]!.name).toBe('lng');
      expect(t.elements[1]!.isOptional).toBe(true);
    });

    test('should parse tuple with all primitive types', () => {
      const schema = `
tuple AllTypes {
  String,
  Int,
  Float,
  Bool,
  Date,
  Email
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const t = ast.tuples[0]!;
      expect(t.elements).toHaveLength(6);
      expect(t.elements[0]!.type).toBe('string');
      expect(t.elements[1]!.type).toBe('int');
      expect(t.elements[2]!.type).toBe('float');
      expect(t.elements[3]!.type).toBe('bool');
      expect(t.elements[4]!.type).toBe('date');
      expect(t.elements[5]!.type).toBe('email');
    });

    test('should parse single-line tuple', () => {
      const schema = `
tuple Point { Float, Float }
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.tuples).toHaveLength(1);

      const t = ast.tuples[0]!;
      expect(t.name).toBe('Point');
      expect(t.elements).toHaveLength(2);
      expect(t.elements[0]!.type).toBe('float');
      expect(t.elements[1]!.type).toBe('float');
    });

    test('should parse single-element tuple', () => {
      const schema = `
tuple Single {
  String
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const t = ast.tuples[0]!;
      expect(t.elements).toHaveLength(1);
      expect(t.elements[0]!.type).toBe('string');
    });

    test('should parse multiple tuples', () => {
      const schema = `
tuple Coordinate {
  lat Float,
  lng Float
}

tuple Range {
  min Int,
  max Int
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.tuples).toHaveLength(2);
      expect(ast.tuples[0]!.name).toBe('Coordinate');
      expect(ast.tuples[1]!.name).toBe('Range');
    });
  });

  describe('object references in tuples', () => {
    test('should parse tuple with object-typed element', () => {
      const schema = `
object Address {
  street String
  city String
}

tuple Located {
  label String,
  Address
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.tuples).toHaveLength(1);

      const t = ast.tuples[0]!;
      expect(t.elements).toHaveLength(2);
      expect(t.elements[1]!.type).toBe('object');
      expect(t.elements[1]!.objectName).toBe('Address');
    });

    test('should parse tuple with named object-typed element', () => {
      const schema = `
object Address {
  street String
  city String
}

tuple Located {
  label String,
  addr Address
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const t = ast.tuples[0]!;
      expect(t.elements[1]!.name).toBe('addr');
      expect(t.elements[1]!.type).toBe('object');
      expect(t.elements[1]!.objectName).toBe('Address');
    });

    test('should parse tuple with optional object-typed element', () => {
      const schema = `
object Address {
  street String
  city String
}

tuple MaybeLocated {
  String,
  Address?
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const t = ast.tuples[0]!;
      expect(t.elements[1]!.type).toBe('object');
      expect(t.elements[1]!.objectName).toBe('Address');
      expect(t.elements[1]!.isOptional).toBe(true);
    });
  });

  describe('nesting (tuple references)', () => {
    test('should parse tuple referencing another tuple', () => {
      const schema = `
tuple Inner {
  Int,
  Int
}

tuple Outer {
  String,
  Inner
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.tuples).toHaveLength(2);

      const outer = ast.tuples[1]!;
      expect(outer.elements).toHaveLength(2);
      expect(outer.elements[1]!.type).toBe('tuple');
      expect(outer.elements[1]!.tupleName).toBe('Inner');
    });

    test('should parse tuple referencing tuple defined later (forward reference)', () => {
      const schema = `
tuple Outer {
  String,
  Inner
}

tuple Inner {
  Int,
  Int
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.tuples).toHaveLength(2);

      const outer = ast.tuples[0]!;
      expect(outer.elements[1]!.type).toBe('tuple');
      expect(outer.elements[1]!.tupleName).toBe('Inner');
    });

    test('should parse self-referencing tuple with optional element', () => {
      const schema = `
tuple Recursive {
  value Int,
  next Recursive?
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const t = ast.tuples[0]!;
      expect(t.elements).toHaveLength(2);
      expect(t.elements[1]!.type).toBe('tuple');
      expect(t.elements[1]!.tupleName).toBe('Recursive');
      expect(t.elements[1]!.isOptional).toBe(true);
    });

    test('should parse tuple referencing tuple from external names', () => {
      const externalTupleNames = new Set(['ExternalTuple']);
      const schema = `
tuple Local {
  String,
  ExternalTuple
}
`;
      const { ast, errors } = parse(schema, undefined, externalTupleNames);
      expect(errors).toHaveLength(0);

      const t = ast.tuples[0]!;
      expect(t.elements[1]!.type).toBe('tuple');
      expect(t.elements[1]!.tupleName).toBe('ExternalTuple');
    });

    test('should parse named nested tuple element', () => {
      const schema = `
tuple Inner { Int, Int }

tuple Outer {
  label String,
  coords Inner
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const outer = ast.tuples[1]!;
      expect(outer.elements[1]!.name).toBe('coords');
      expect(outer.elements[1]!.type).toBe('tuple');
      expect(outer.elements[1]!.tupleName).toBe('Inner');
    });
  });

  describe('model with tuple fields', () => {
    test('should parse model with required tuple field', () => {
      const schema = `
tuple Coordinate {
  lat Float,
  lng Float
}

model User {
  id Record @id
  location Coordinate
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.tuples).toHaveLength(1);
      expect(ast.models).toHaveLength(1);

      const locationField = ast.models[0]!.fields.find((f) => f.name === 'location')!;
      expect(locationField.type).toBe('tuple');
      expect(locationField.tupleName).toBe('Coordinate');
    });

    test('should parse model with optional tuple field', () => {
      const schema = `
tuple Coordinate {
  Float,
  Float
}

model User {
  id Record @id
  backup Coordinate?
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const backupField = ast.models[0]!.fields.find((f) => f.name === 'backup')!;
      expect(backupField.type).toBe('tuple');
      expect(backupField.tupleName).toBe('Coordinate');
      expect(backupField.isOptional).toBe(true);
    });

    test('should parse model with array tuple field', () => {
      const schema = `
tuple Coordinate {
  Float,
  Float
}

model User {
  id Record @id
  history Coordinate[]
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const historyField = ast.models[0]!.fields.find((f) => f.name === 'history')!;
      expect(historyField.type).toBe('tuple');
      expect(historyField.tupleName).toBe('Coordinate');
      expect(historyField.isArray).toBe(true);
    });

    test('should parse model with tuple defined after model (forward reference)', () => {
      const schema = `
model User {
  id Record @id
  location Coordinate
}

tuple Coordinate {
  lat Float,
  lng Float
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const locationField = ast.models[0]!.fields.find((f) => f.name === 'location')!;
      expect(locationField.type).toBe('tuple');
      expect(locationField.tupleName).toBe('Coordinate');
    });

    test('should parse model with multiple tuple fields of same type', () => {
      const schema = `
tuple Coordinate {
  Float,
  Float
}

model User {
  id Record @id
  home Coordinate
  work Coordinate?
  history Coordinate[]
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const home = ast.models[0]!.fields.find((f) => f.name === 'home')!;
      const work = ast.models[0]!.fields.find((f) => f.name === 'work')!;
      const history = ast.models[0]!.fields.find((f) => f.name === 'history')!;
      expect(home.type).toBe('tuple');
      expect(home.tupleName).toBe('Coordinate');
      expect(work.type).toBe('tuple');
      expect(work.isOptional).toBe(true);
      expect(history.type).toBe('tuple');
      expect(history.isArray).toBe(true);
    });

    test('should parse model with tuple fields and other fields', () => {
      const schema = `
tuple Coordinate {
  Float,
  Float
}

model User {
  id Record @id
  name String
  location Coordinate
  age Int?
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const fields = ast.models[0]!.fields;
      expect(fields).toHaveLength(4);
      expect(fields.find((f) => f.name === 'name')!.type).toBe('string');
      expect(fields.find((f) => f.name === 'location')!.type).toBe('tuple');
      expect(fields.find((f) => f.name === 'age')!.type).toBe('int');
    });
  });

  describe('object with tuple fields', () => {
    test('should parse object with tuple-typed field', () => {
      const schema = `
tuple Coordinate {
  Float,
  Float
}

object Place {
  name String
  coords Coordinate
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const coordsField = ast.objects[0]!.fields.find((f) => f.name === 'coords')!;
      expect(coordsField.type).toBe('tuple');
      expect(coordsField.tupleName).toBe('Coordinate');
    });

    test('should parse object with optional tuple field', () => {
      const schema = `
tuple Coordinate { Float, Float }

object Place {
  name String
  coords Coordinate?
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const coordsField = ast.objects[0]!.fields.find((f) => f.name === 'coords')!;
      expect(coordsField.type).toBe('tuple');
      expect(coordsField.isOptional).toBe(true);
    });

    test('should parse object with array of tuples', () => {
      const schema = `
tuple Coordinate { Float, Float }

object Route {
  name String
  waypoints Coordinate[]
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const waypointsField = ast.objects[0]!.fields.find((f) => f.name === 'waypoints')!;
      expect(waypointsField.type).toBe('tuple');
      expect(waypointsField.isArray).toBe(true);
    });
  });

  describe('validation errors', () => {
    test('should error on duplicate tuple name', () => {
      const schema = `
tuple Point {
  Float,
  Float
}

tuple Point {
  Int,
  Int
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.some((e) => e.message.includes('Duplicate tuple name: Point'))).toBe(true);
    });

    test('should error on tuple name conflicting with model name', () => {
      const schema = `
model User {
  id Record @id
  name String
}

tuple User {
  String,
  Int
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.some((e) => e.message.includes("Tuple name 'User' conflicts with model name"))).toBe(true);
    });

    test('should error on tuple name conflicting with object name', () => {
      const schema = `
object Address {
  street String
}

tuple Address {
  String,
  String
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.some((e) => e.message.includes("Tuple name 'Address' conflicts with object name"))).toBe(true);
    });

    test('should error on empty tuple (no elements)', () => {
      const schema = `
tuple Empty {
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.some((e) => e.message.includes('at least one element'))).toBe(true);
    });

    test('should error on duplicate named elements', () => {
      const schema = `
tuple Bad {
  x Float,
  x Float
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.some((e) => e.message.includes('Duplicate element name'))).toBe(true);
    });

    test('should error on Relation type in tuple', () => {
      const schema = `
model User {
  id Record @id
}

tuple Bad {
  String,
  Relation
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.some((e) => e.message.includes('relation') || e.message.includes('Relation'))).toBe(true);
    });

    test('should error on Record type in tuple', () => {
      const schema = `
tuple Bad {
  String,
  Record
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.some((e) => e.message.includes('record') || e.message.includes('Record'))).toBe(true);
    });

    test('should error on required self-referencing tuple element', () => {
      const schema = `
tuple Bad {
  value Int,
  next Bad
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      expect(errors.some((e) => e.message.includes('Self-referencing') && e.message.includes('optional'))).toBe(true);
    });

    test('should NOT error on optional self-referencing tuple element', () => {
      const schema = `
tuple Good {
  value Int,
  next Good?
}
`;
      const { ast } = parse(schema);
      const errors = validateSchema(ast);
      // Filter for self-referencing errors only
      const selfRefErrors = errors.filter((e) => e.message.includes('Self-referencing'));
      expect(selfRefErrors).toHaveLength(0);
    });

    test('should produce parse error on tuple element referencing non-existent type', () => {
      const schema = `
tuple Bad {
  String,
  NonExistent
}
`;
      const { errors } = parse(schema);
      // Unknown types are caught at parse time as invalid elements
      expect(errors.some((e) => e.message.includes('Invalid tuple element'))).toBe(true);
    });

    test('should produce parse error on tuple element with unknown tuple reference', () => {
      const schema = `
tuple Bad {
  String,
  NonExistentTuple
}
`;
      const { errors } = parse(schema);
      expect(errors.some((e) => e.message.includes('Invalid tuple element'))).toBe(true);
    });
  });

  describe('collectTupleNames', () => {
    test('should collect tuple names from source', () => {
      const source = `
tuple Coordinate {
  Float,
  Float
}

model User {
  id Record @id
}

tuple Range {
  Int,
  Int
}
`;
      const names = collectTupleNames(source);
      expect(names.has('Coordinate')).toBe(true);
      expect(names.has('Range')).toBe(true);
      expect(names.has('User')).toBe(false);
    });

    test('should return empty set for schema with no tuples', () => {
      const source = `
model User {
  id Record @id
}
`;
      const names = collectTupleNames(source);
      expect(names.size).toBe(0);
    });

    test('should not include object or model names', () => {
      const source = `
object Address {
  street String
}

tuple Point { Float, Float }

model User {
  id Record @id
}
`;
      const names = collectTupleNames(source);
      expect(names.has('Point')).toBe(true);
      expect(names.has('Address')).toBe(false);
      expect(names.has('User')).toBe(false);
    });
  });

  describe('coexistence', () => {
    test('should parse models, objects, and tuples together', () => {
      const schema = `
tuple Coordinate {
  lat Float,
  lng Float
}

object Address {
  street String
  city String
}

model User {
  id Record @id
  name String
  location Coordinate
  address Address
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.tuples).toHaveLength(1);
      expect(ast.objects).toHaveLength(1);
      expect(ast.models).toHaveLength(1);

      const locField = ast.models[0]!.fields.find((f) => f.name === 'location')!;
      expect(locField.type).toBe('tuple');
      expect(locField.tupleName).toBe('Coordinate');

      const addrField = ast.models[0]!.fields.find((f) => f.name === 'address')!;
      expect(addrField.type).toBe('object');
      expect(addrField.objectName).toBe('Address');
    });

    test('should parse tuple used in both model and object', () => {
      const schema = `
tuple Coordinate { Float, Float }

object Place {
  name String
  coords Coordinate
}

model User {
  id Record @id
  location Coordinate
  place Place
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const objCoords = ast.objects[0]!.fields.find((f) => f.name === 'coords')!;
      expect(objCoords.type).toBe('tuple');

      const modelLoc = ast.models[0]!.fields.find((f) => f.name === 'location')!;
      expect(modelLoc.type).toBe('tuple');
    });

    test('should parse tuple referencing object and another tuple', () => {
      const schema = `
object Label {
  text String
}

tuple Inner { Int, Int }

tuple Complex {
  name String,
  Label,
  Inner
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const complex = ast.tuples.find((t) => t.name === 'Complex')!;
      expect(complex.elements).toHaveLength(3);
      expect(complex.elements[0]!.type).toBe('string');
      expect(complex.elements[1]!.type).toBe('object');
      expect(complex.elements[1]!.objectName).toBe('Label');
      expect(complex.elements[2]!.type).toBe('tuple');
      expect(complex.elements[2]!.tupleName).toBe('Inner');
    });

    test('should parse with multiple models using same tuple', () => {
      const schema = `
tuple Coordinate { Float, Float }

model User {
  id Record @id
  home Coordinate
}

model Store {
  id Record @id
  location Coordinate
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.models).toHaveLength(2);

      const userLoc = ast.models[0]!.fields.find((f) => f.name === 'home')!;
      const storeLoc = ast.models[1]!.fields.find((f) => f.name === 'location')!;
      expect(userLoc.tupleName).toBe('Coordinate');
      expect(storeLoc.tupleName).toBe('Coordinate');
    });
  });

  describe('edge cases', () => {
    test('should handle tuple with trailing comma', () => {
      const schema = `
tuple Point {
  Float,
  Float,
}
`;
      const { ast, errors } = parse(schema);
      // May or may not error — trailing comma produces empty string after split, filtered out
      if (!errors.length) {
        expect(ast.tuples[0]!.elements).toHaveLength(2);
      }
    });

    test('should handle tuple with comments in block', () => {
      const schema = `
tuple Point {
  // x coordinate
  Float,
  // y coordinate
  Float
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.tuples[0]!.elements).toHaveLength(2);
    });

    test('should handle inline tuple with opening brace on same line', () => {
      const schema = `tuple Point { Float, Float }`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.tuples).toHaveLength(1);
      expect(ast.tuples[0]!.elements).toHaveLength(2);
    });

    test('should handle multi-line tuple with brace on next line', () => {
      const schema = `
tuple Point
{
  Float,
  Float
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.tuples[0]!.elements).toHaveLength(2);
    });
  });
});
