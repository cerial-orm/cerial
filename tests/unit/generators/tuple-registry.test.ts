/**
 * Unit Tests: Tuple Registry Generator
 *
 * Tests tuple metadata conversion, registry creation, and code generation.
 */

import { describe, expect, test } from 'bun:test';
import {
  convertTuple,
  convertTuples,
  createTupleRegistry,
  resolveObjectFields,
} from '../../../src/generators/metadata/model-converter';
import {
  generateTupleRegistryCode,
  generateFullRegistryCode,
} from '../../../src/generators/metadata/registry-generator';
import { convertField } from '../../../src/generators/metadata/field-converter';
import type {
  ASTTuple,
  ASTTupleElement,
  FieldMetadata,
  ModelMetadata,
  ObjectMetadata,
  TupleElementMetadata,
  TupleMetadata,
  TupleRegistry,
  ObjectRegistry,
} from '../../../src/types';

// Helper to create AST tuple element
function astElem(overrides: Partial<ASTTupleElement> & { type: ASTTupleElement['type'] }): ASTTupleElement {
  return {
    isOptional: false,
    ...overrides,
  };
}

function astTuple(name: string, elements: ASTTupleElement[]): ASTTuple {
  return {
    name,
    elements,
    range: { start: { line: 1, column: 0, offset: 0 }, end: { line: 2, column: 0, offset: 0 } },
  };
}

function field(overrides: Partial<FieldMetadata>): FieldMetadata {
  return {
    name: 'test',
    type: 'string',
    isId: false,
    isUnique: false,
    isRequired: true,
    ...overrides,
  };
}

describe('Tuple Registry', () => {
  describe('convertTuple', () => {
    test('should convert AST tuple to TupleMetadata', () => {
      const ast = astTuple('Coordinate', [
        astElem({ type: 'float', name: 'lat' }),
        astElem({ type: 'float', name: 'lng' }),
      ]);

      const result = convertTuple(ast);

      expect(result.name).toBe('Coordinate');
      expect(result.elements).toHaveLength(2);
      expect(result.elements[0]!.index).toBe(0);
      expect(result.elements[0]!.type).toBe('float');
      expect(result.elements[0]!.name).toBe('lat');
      expect(result.elements[1]!.index).toBe(1);
      expect(result.elements[1]!.name).toBe('lng');
    });

    test('should set index correctly for each element', () => {
      const ast = astTuple('Entry', [astElem({ type: 'string' }), astElem({ type: 'int' }), astElem({ type: 'bool' })]);

      const result = convertTuple(ast);

      expect(result.elements[0]!.index).toBe(0);
      expect(result.elements[1]!.index).toBe(1);
      expect(result.elements[2]!.index).toBe(2);
    });

    test('should preserve isOptional flag', () => {
      const ast = astTuple('MaybePoint', [astElem({ type: 'float' }), astElem({ type: 'float', isOptional: true })]);

      const result = convertTuple(ast);

      expect(result.elements[0]!.isOptional).toBe(false);
      expect(result.elements[1]!.isOptional).toBe(true);
    });

    test('should set objectInfo for object-typed elements', () => {
      const ast = astTuple('Located', [
        astElem({ type: 'string' }),
        astElem({ type: 'object', objectName: 'Address' }),
      ]);

      const result = convertTuple(ast);

      expect(result.elements[1]!.objectInfo).toBeDefined();
      expect(result.elements[1]!.objectInfo!.objectName).toBe('Address');
      expect(result.elements[1]!.objectInfo!.fields).toEqual([]);
    });

    test('should set tupleInfo for nested tuple elements', () => {
      const ast = astTuple('Nested', [astElem({ type: 'string' }), astElem({ type: 'tuple', tupleName: 'Inner' })]);

      const result = convertTuple(ast);

      expect(result.elements[1]!.tupleInfo).toBeDefined();
      expect(result.elements[1]!.tupleInfo!.tupleName).toBe('Inner');
      expect(result.elements[1]!.tupleInfo!.elements).toEqual([]);
    });

    test('should not set name for unnamed elements', () => {
      const ast = astTuple('Point', [astElem({ type: 'float' }), astElem({ type: 'float' })]);

      const result = convertTuple(ast);

      expect(result.elements[0]!.name).toBeUndefined();
      expect(result.elements[1]!.name).toBeUndefined();
    });
  });

  describe('convertTuples', () => {
    test('should convert multiple AST tuples', () => {
      const tuples = [
        astTuple('Coordinate', [astElem({ type: 'float' }), astElem({ type: 'float' })]),
        astTuple('Range', [astElem({ type: 'int' }), astElem({ type: 'int' })]),
      ];

      const result = convertTuples(tuples);

      expect(result).toHaveLength(2);
      expect(result[0]!.name).toBe('Coordinate');
      expect(result[1]!.name).toBe('Range');
    });

    test('should return empty array for empty input', () => {
      const result = convertTuples([]);
      expect(result).toEqual([]);
    });
  });

  describe('createTupleRegistry', () => {
    test('should create registry indexed by name', () => {
      const tuples: TupleMetadata[] = [
        {
          name: 'Coordinate',
          elements: [
            { index: 0, type: 'float', isOptional: false },
            { index: 1, type: 'float', isOptional: false },
          ],
        },
        {
          name: 'Range',
          elements: [
            { index: 0, type: 'int', isOptional: false },
            { index: 1, type: 'int', isOptional: false },
          ],
        },
      ];

      const registry = createTupleRegistry(tuples);

      expect(registry['Coordinate']).toBeDefined();
      expect(registry['Range']).toBeDefined();
      expect(registry['Coordinate']!.name).toBe('Coordinate');
      expect(registry['Range']!.name).toBe('Range');
    });

    test('should return empty registry for empty input', () => {
      const registry = createTupleRegistry([]);
      expect(Object.keys(registry)).toHaveLength(0);
    });
  });

  describe('resolveObjectFields with tuples', () => {
    test('should resolve tuple field tupleInfo.elements on model fields', () => {
      const coordTuple: TupleMetadata = {
        name: 'Coordinate',
        elements: [
          { index: 0, type: 'float', isOptional: false, name: 'lat' },
          { index: 1, type: 'float', isOptional: false, name: 'lng' },
        ],
      };
      const tupleRegistry: TupleRegistry = { Coordinate: coordTuple };
      const objectRegistry: ObjectRegistry = {};

      const models: ModelMetadata[] = [
        {
          name: 'User',
          tableName: 'user',
          fields: [
            field({ name: 'id', type: 'record', isId: true }),
            field({ name: 'location', type: 'tuple', tupleInfo: { tupleName: 'Coordinate', elements: [] } }),
          ],
        },
      ];

      resolveObjectFields(models, [], objectRegistry, tupleRegistry);

      const locField = models[0]!.fields.find((f) => f.name === 'location')!;
      expect(locField.tupleInfo!.elements).toHaveLength(2);
      expect(locField.tupleInfo!.elements[0]!.name).toBe('lat');
      expect(locField.tupleInfo!.elements[1]!.name).toBe('lng');
    });

    test('should resolve nested tuple elements in tuple registry', () => {
      const innerTuple: TupleMetadata = {
        name: 'Inner',
        elements: [
          { index: 0, type: 'int', isOptional: false },
          { index: 1, type: 'int', isOptional: false },
        ],
      };
      const outerTuple: TupleMetadata = {
        name: 'Outer',
        elements: [
          { index: 0, type: 'string', isOptional: false },
          { index: 1, type: 'tuple', isOptional: false, tupleInfo: { tupleName: 'Inner', elements: [] } },
        ],
      };
      const tupleRegistry: TupleRegistry = { Inner: innerTuple, Outer: outerTuple };
      const objectRegistry: ObjectRegistry = {};

      resolveObjectFields([], [], objectRegistry, tupleRegistry);

      // Outer's element[1].tupleInfo.elements should now be resolved
      const outerElem1 = tupleRegistry['Outer']!.elements[1]!;
      expect(outerElem1.tupleInfo!.elements).toHaveLength(2);
      expect(outerElem1.tupleInfo!.elements[0]!.type).toBe('int');
    });

    test('should resolve object elements in tuple registry', () => {
      const addrObject: ObjectMetadata = {
        name: 'Address',
        fields: [field({ name: 'street', type: 'string' }), field({ name: 'city', type: 'string' })],
      };
      const locatedTuple: TupleMetadata = {
        name: 'Located',
        elements: [
          { index: 0, type: 'string', isOptional: false },
          { index: 1, type: 'object', isOptional: false, objectInfo: { objectName: 'Address', fields: [] } },
        ],
      };
      const tupleRegistry: TupleRegistry = { Located: locatedTuple };
      const objectRegistry: ObjectRegistry = { Address: addrObject };

      resolveObjectFields([], [addrObject], objectRegistry, tupleRegistry);

      const objElem = tupleRegistry['Located']!.elements[1]!;
      expect(objElem.objectInfo!.fields).toHaveLength(2);
      expect(objElem.objectInfo!.fields[0]!.name).toBe('street');
    });
  });

  describe('generateTupleRegistryCode', () => {
    test('should generate valid registry code', () => {
      const tuples: TupleMetadata[] = [
        {
          name: 'Coordinate',
          elements: [
            { index: 0, type: 'float', isOptional: false, name: 'lat' },
            { index: 1, type: 'float', isOptional: false, name: 'lng' },
          ],
        },
      ];

      const code = generateTupleRegistryCode(tuples);

      expect(code).toContain('tupleRegistry');
      expect(code).toContain('TupleRegistry');
      expect(code).toContain('Coordinate');
      expect(code).toContain("name: 'lat'");
      expect(code).toContain("type: 'float'");
    });

    test('should return empty string for no tuples', () => {
      const code = generateTupleRegistryCode([]);
      expect(code).toBe('');
    });

    test('should include nested tupleInfo in generated code', () => {
      const tuples: TupleMetadata[] = [
        {
          name: 'Nested',
          elements: [
            { index: 0, type: 'string', isOptional: false },
            {
              index: 1,
              type: 'tuple',
              isOptional: false,
              tupleInfo: {
                tupleName: 'Inner',
                elements: [{ index: 0, type: 'int', isOptional: false }],
              },
            },
          ],
        },
      ];

      const code = generateTupleRegistryCode(tuples);

      expect(code).toContain("tupleName: 'Inner'");
    });
  });

  describe('generateFullRegistryCode', () => {
    test('should include TupleRegistry import when tuples present', () => {
      const models: ModelMetadata[] = [
        { name: 'User', tableName: 'user', fields: [field({ name: 'id', type: 'record', isId: true })] },
      ];
      const tuples: TupleMetadata[] = [{ name: 'Point', elements: [{ index: 0, type: 'float', isOptional: false }] }];

      const code = generateFullRegistryCode(models, [], tuples);

      expect(code).toContain('TupleRegistry');
      expect(code).toContain('tupleRegistry');
      expect(code).toContain('ModelRegistry');
      expect(code).toContain('modelRegistry');
    });

    test('should not include TupleRegistry when no tuples', () => {
      const models: ModelMetadata[] = [
        { name: 'User', tableName: 'user', fields: [field({ name: 'id', type: 'record', isId: true })] },
      ];

      const code = generateFullRegistryCode(models, [], []);

      expect(code).not.toContain('TupleRegistry');
      expect(code).not.toContain('tupleRegistry');
    });

    test('should include all three registries when all present', () => {
      const models: ModelMetadata[] = [
        { name: 'User', tableName: 'user', fields: [field({ name: 'id', type: 'record', isId: true })] },
      ];
      const objects: ObjectMetadata[] = [{ name: 'Address', fields: [field({ name: 'city', type: 'string' })] }];
      const tuples: TupleMetadata[] = [{ name: 'Point', elements: [{ index: 0, type: 'float', isOptional: false }] }];

      const code = generateFullRegistryCode(models, objects, tuples);

      expect(code).toContain('ModelRegistry');
      expect(code).toContain('ObjectRegistry');
      expect(code).toContain('TupleRegistry');
    });
  });
});
