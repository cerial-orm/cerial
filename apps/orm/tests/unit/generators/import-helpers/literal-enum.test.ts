/**
 * Unit tests for the literal and enum resolvers and import writers in import-helpers.ts.
 * Enum fields carry type 'literal' with literalInfo.isEnum, so the resolvers split one
 * field type into two import families.
 */

import { describe, expect, test } from 'bun:test';
import {
  generateEnumImports,
  generateLiteralImports,
  generateLiteralObjectImports,
  generateLiteralTupleImports,
  getLiteralReferencedObjectNames,
  getLiteralReferencedTupleNames,
  getModelReferencedEnumNames,
  getModelReferencedLiteralNames,
  getObjectReferencedEnumNames,
  getObjectReferencedLiteralNames,
  getTupleReferencedEnumNames,
  getTupleReferencedLiteralNames,
} from '../../../../src/generators/client/import-helpers';
import type { LiteralRegistry, ResolvedLiteralVariant } from '../../../../src/types';
import { element, field, literal, literalField, literalInfo, model, object, tuple, tupleInfo } from '../fixtures';

const statusVariants: ResolvedLiteralVariant[] = [
  { kind: 'string', value: 'on' },
  { kind: 'string', value: 'off' },
];
const tupleRefVariant: ResolvedLiteralVariant = {
  kind: 'tupleRef',
  tupleName: 'Coord',
  tupleInfo: tupleInfo('Coord', []),
};
const objectRefVariant: ResolvedLiteralVariant = {
  kind: 'objectRef',
  objectName: 'Geo',
  objectInfo: { objectName: 'Geo', fields: [] },
};

describe('getLiteralReferencedObjectNames / getLiteralReferencedTupleNames', () => {
  const lit = literal('Shape', [
    { kind: 'string', value: 'none' },
    objectRefVariant,
    { kind: 'objectRef', objectName: 'Geo', objectInfo: { objectName: 'Geo', fields: [] } },
    { kind: 'objectRef', objectName: 'Box', objectInfo: { objectName: 'Box', fields: [] } },
    tupleRefVariant,
    { kind: 'tupleRef', tupleName: 'Coord', tupleInfo: tupleInfo('Coord', []) },
    { kind: 'broadType', typeName: 'int' },
  ]);

  test('object names come from objectRef variants only, deduplicated', () => {
    expect(getLiteralReferencedObjectNames(lit)).toEqual(['Geo', 'Box']);
  });

  test('tuple names come from tupleRef variants only, deduplicated', () => {
    expect(getLiteralReferencedTupleNames(lit)).toEqual(['Coord']);
  });

  test('a literal of plain values references neither', () => {
    const plain = literal('Status', statusVariants);

    expect(getLiteralReferencedObjectNames(plain)).toEqual([]);
    expect(getLiteralReferencedTupleNames(plain)).toEqual([]);
  });
});

describe('literal and enum name resolvers', () => {
  const plain = literalInfo('Status', statusVariants);
  const plainFalse = literalInfo('Mood', statusVariants, false);
  const enumInfo = literalInfo('Role', statusVariants, true);

  const fields = [
    literalField('a', plain),
    literalField('b', plain),
    literalField('c', plainFalse),
    literalField('d', enumInfo),
    literalField('e', enumInfo),
    literalField('f', literalInfo('Tier', [], true)),
    field({ name: 'bare', type: 'literal' }),
    field({ name: 'name' }),
  ];

  test('model: literal names exclude enums and fields without literalInfo, deduplicated', () => {
    expect(getModelReferencedLiteralNames(model('M', fields))).toEqual(['Status', 'Mood']);
  });

  test('model: enum names include only isEnum fields, deduplicated', () => {
    expect(getModelReferencedEnumNames(model('M', fields))).toEqual(['Role', 'Tier']);
  });

  test('object: literal names exclude enums', () => {
    expect(getObjectReferencedLiteralNames(object('O', fields))).toEqual(['Status', 'Mood']);
  });

  test('object: enum names include only isEnum fields', () => {
    expect(getObjectReferencedEnumNames(object('O', fields))).toEqual(['Role', 'Tier']);
  });

  test('tuple: literal names exclude enums and elements without literalInfo', () => {
    const t = tuple('T', [
      element(0, 'literal', { literalInfo: plain }),
      element(1, 'literal', { literalInfo: plain }),
      element(2, 'literal', { literalInfo: enumInfo }),
      element(3, 'literal'),
      element(4, 'string'),
    ]);

    expect(getTupleReferencedLiteralNames(t)).toEqual(['Status']);
  });

  test('tuple: enum names include only isEnum elements', () => {
    const t = tuple('T', [
      element(0, 'literal', { literalInfo: plain }),
      element(1, 'literal', { literalInfo: enumInfo }),
      element(2, 'literal', { literalInfo: enumInfo }),
      element(3, 'literal'),
    ]);

    expect(getTupleReferencedEnumNames(t)).toEqual(['Role']);
  });

  test('no literal fields gives empty results everywhere', () => {
    const m = model('M', [field({ name: 'x' })]);

    expect(getModelReferencedLiteralNames(m)).toEqual([]);
    expect(getModelReferencedEnumNames(m)).toEqual([]);
    expect(getObjectReferencedLiteralNames(object('O', []))).toEqual([]);
    expect(getObjectReferencedEnumNames(object('O', []))).toEqual([]);
    expect(getTupleReferencedLiteralNames(tuple('T', []))).toEqual([]);
    expect(getTupleReferencedEnumNames(tuple('T', []))).toEqual([]);
  });
});

describe('generateLiteralImports', () => {
  test('returns an empty string for no names', () => {
    expect(generateLiteralImports([])).toBe('');
  });

  test('imports the type and its Where from the same directory by default', () => {
    expect(generateLiteralImports(['Status'])).toBe(`import type { Status, StatusWhere } from './status';\n`);
  });

  test('honours a custom import prefix', () => {
    expect(generateLiteralImports(['Status'], undefined, '../literals')).toBe(
      `import type { Status, StatusWhere } from '../literals/status';\n`,
    );
  });

  test('adds Input for a literal with a tupleRef variant', () => {
    const registry: LiteralRegistry = { Spot: literal('Spot', [tupleRefVariant]) };

    expect(generateLiteralImports(['Spot'], registry)).toBe(
      `import type { Spot, SpotWhere, SpotInput } from './spot';\n`,
    );
  });

  test('adds Input for a literal with an objectRef variant', () => {
    const registry: LiteralRegistry = { Place: literal('Place', [objectRefVariant]) };

    expect(generateLiteralImports(['Place'], registry)).toBe(
      `import type { Place, PlaceWhere, PlaceInput } from './place';\n`,
    );
  });

  test('omits Input for a literal of plain values and for a name missing from the registry', () => {
    const registry: LiteralRegistry = { Status: literal('Status', statusVariants) };

    expect(generateLiteralImports(['Status', 'Ghost'], registry)).toBe(
      `import type { Status, StatusWhere } from './status';\nimport type { Ghost, GhostWhere } from './ghost';\n`,
    );
  });
});

describe('generateEnumImports', () => {
  test('returns an empty string for no names', () => {
    expect(generateEnumImports([])).toBe('');
  });

  test('imports the const as a value and the type and Where as types', () => {
    expect(generateEnumImports(['Role'])).toBe(
      `import { RoleEnum } from './role';\nimport type { RoleEnumType, RoleEnumWhere } from './role';\n`,
    );
  });

  test('honours a custom import prefix', () => {
    expect(generateEnumImports(['Role'], '../enums')).toBe(
      `import { RoleEnum } from '../enums/role';\nimport type { RoleEnumType, RoleEnumWhere } from '../enums/role';\n`,
    );
  });

  test('lowercases the file name and emits one pair per enum', () => {
    expect(generateEnumImports(['UserRole', 'Tier'])).toBe(
      `import { UserRoleEnum } from './userrole';\nimport type { UserRoleEnumType, UserRoleEnumWhere } from './userrole';\n` +
        `import { TierEnum } from './tier';\nimport type { TierEnumType, TierEnumWhere } from './tier';\n`,
    );
  });

  test('uses the Enum-suffixed names, unlike literals', () => {
    expect(generateEnumImports(['Role'])).not.toBe(generateLiteralImports(['Role']));
  });
});

describe('generateLiteralObjectImports / generateLiteralTupleImports', () => {
  test('object: empty input gives an empty string', () => {
    expect(generateLiteralObjectImports([])).toBe('');
  });

  test('object: imports the type and Input from ../objects by default', () => {
    expect(generateLiteralObjectImports(['Geo', 'Box'])).toBe(
      `import type { Geo, GeoInput } from '../objects/geo';\nimport type { Box, BoxInput } from '../objects/box';\n`,
    );
  });

  test('object: honours a custom prefix and ignores the registry', () => {
    expect(generateLiteralObjectImports(['Geo'], {}, './objects')).toBe(
      `import type { Geo, GeoInput } from './objects/geo';\n`,
    );
  });

  test('tuple: empty input gives an empty string', () => {
    expect(generateLiteralTupleImports([])).toBe('');
  });

  test('tuple: imports the type and Input from ../tuples by default', () => {
    expect(generateLiteralTupleImports(['Coord', 'Range'])).toBe(
      `import type { Coord, CoordInput } from '../tuples/coord';\nimport type { Range, RangeInput } from '../tuples/range';\n`,
    );
  });

  test('tuple: honours a custom prefix and ignores the registry', () => {
    expect(generateLiteralTupleImports(['Coord'], {}, './tuples')).toBe(
      `import type { Coord, CoordInput } from './tuples/coord';\n`,
    );
  });
});
