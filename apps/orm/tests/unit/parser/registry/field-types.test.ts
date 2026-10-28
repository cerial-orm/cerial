import { describe, expect, test } from 'bun:test';
import type { SchemaFieldType } from '../../../../src/types';
import { FIELD_TYPE_REGISTRY, matchFieldTypeToken } from '../../../../src/parser/registry';
import { parseFieldType } from '../../../../src/parser/types/field-types';
import {
  getAnyFieldType,
  getBoolFieldType,
  getBytesFieldType,
  getDateFieldType,
  getDecimalFieldType,
  getDurationFieldType,
  getEmailFieldType,
  getFloatFieldType,
  getGeometryFieldType,
  getIntFieldType,
  getNumberFieldType,
  getRecordFieldType,
  getRelationFieldType,
  getStringFieldType,
  getUuidFieldType,
  isAnyType,
  isBoolType,
  isBytesType,
  isDateType,
  isDecimalType,
  isDurationType,
  isEmailType,
  isFloatType,
  isGeometryType,
  isIntType,
  isNumberType,
  isRecordType,
  isRelationType,
  isStringType,
  isUuidType,
} from '../../../../src/parser/types/field-types';

// The original per-type checks, called directly: an independent reference for the registry lookup.
const REFERENCE: [string, (t: string) => boolean, () => SchemaFieldType, 'base' | 'raw'][] = [
  ['String', isStringType, getStringFieldType, 'base'],
  ['Email', isEmailType, getEmailFieldType, 'base'],
  ['Int', isIntType, getIntFieldType, 'base'],
  ['Date', isDateType, getDateFieldType, 'base'],
  ['Bool', isBoolType, getBoolFieldType, 'base'],
  ['Float', isFloatType, getFloatFieldType, 'base'],
  ['Number', isNumberType, getNumberFieldType, 'base'],
  ['Uuid', isUuidType, getUuidFieldType, 'base'],
  ['Duration', isDurationType, getDurationFieldType, 'base'],
  ['Decimal', isDecimalType, getDecimalFieldType, 'base'],
  ['Bytes', isBytesType, getBytesFieldType, 'base'],
  ['Geometry', isGeometryType, getGeometryFieldType, 'base'],
  ['Any', isAnyType, getAnyFieldType, 'base'],
  ['Record', isRecordType, getRecordFieldType, 'raw'],
  ['Relation', isRelationType, getRelationFieldType, 'raw'],
];

function referenceType(token: string): SchemaFieldType | null {
  const base = token.replace('[]', '');
  for (const [, is, get, on] of REFERENCE) if (is(on === 'base' ? base : token)) return get();

  return null;
}

const TOKENS = [
  ...REFERENCE.flatMap(([name]) => [
    name,
    `${name}[]`,
    name.toLowerCase(),
    name.toUpperCase(),
    `${name}?`,
    `${name}[][]`,
  ]),
  'Record(int)',
  'Record(string, int)',
  'Record(int)[]',
  'Record(MyTuple)',
  'Record()',
  'Record(',
  'RecordX',
  'Relation[]',
  'Rel[]ation',
  'Str[]ing',
  'Address',
  'Address[]',
  '',
  '[]',
];

describe('registry: field types', () => {
  test('holds all fifteen built-in types, each with a description', () => {
    expect([...FIELD_TYPE_REGISTRY.keys()]).toEqual(REFERENCE.map(([name]) => name));
    for (const entry of FIELD_TYPE_REGISTRY.values()) expect(entry.description.length).toBeGreaterThan(10);
  });

  test.each(REFERENCE)('%s records the type its parser returns', (name, _is, get) => {
    expect(FIELD_TYPE_REGISTRY.get(name)?.fieldType).toBe(get());
  });

  test.each(TOKENS)('%p resolves like the original checks', (token) => {
    expect(matchFieldTypeToken(token)?.fieldType ?? null).toBe(referenceType(token));
    expect(parseFieldType(token)).toBe(referenceType(token));
  });

  test('every entry matches exactly the tokens its own check matches', () => {
    for (const [name, is, , on] of REFERENCE) {
      const entry = FIELD_TYPE_REGISTRY.get(name)!;
      for (const token of TOKENS) {
        const base = token.replace('[]', '');
        expect(entry.match(token, base), `${name} on ${token}`).toBe(is(on === 'base' ? base : token));
      }
    }
  });
});

describe('field types: names that are not registry types', () => {
  const objects = new Set(['Address']);
  const tuples = new Set(['Point']);
  const literals = new Set(['Status']);

  test('user-defined names still resolve after the built-ins', () => {
    expect(parseFieldType('Address', objects, tuples, literals)).toBe('object');
    expect(parseFieldType('Address[]', objects, tuples, literals)).toBe('object');
    expect(parseFieldType('Point', objects, tuples, literals)).toBe('tuple');
    expect(parseFieldType('Status', objects, tuples, literals)).toBe('literal');
  });

  test('a user-defined name does not shadow a built-in', () => {
    expect(parseFieldType('String', new Set(['String']), tuples, literals)).toBe('string');
  });

  test('unknown names are refused', () => {
    expect(parseFieldType('Nope', objects, tuples, literals)).toBeNull();
    expect(parseFieldType('Address')).toBeNull();
    expect(matchFieldTypeToken('Address')).toBeUndefined();
  });
});
