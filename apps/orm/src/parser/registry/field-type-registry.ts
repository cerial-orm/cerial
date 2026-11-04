import { getAnyFieldType, isAnyType } from '../types/field-types/any-parser';
import { getBoolFieldType, isBoolType } from '../types/field-types/bool-parser';
import { getBytesFieldType, isBytesType } from '../types/field-types/bytes-parser';
import { getDateFieldType, isDateType } from '../types/field-types/date-parser';
import { getDecimalFieldType, isDecimalType } from '../types/field-types/decimal-parser';
import { getDurationFieldType, isDurationType } from '../types/field-types/duration-parser';
import { getEmailFieldType, isEmailType } from '../types/field-types/email-parser';
import { getFloatFieldType, isFloatType } from '../types/field-types/float-parser';
import { getGeometryFieldType, isGeometryType } from '../types/field-types/geometry-parser';
import { getIntFieldType, isIntType } from '../types/field-types/int-parser';
import { getNumberFieldType, isNumberType } from '../types/field-types/number-parser';
import { getRecordFieldType, isRecordType } from '../types/field-types/record-parser';
import { getRelationFieldType, isRelationType } from '../types/field-types/relation-parser';
import { SIZED_NUMBER_TYPES } from '../types/field-types/sized-number-parser';
import { getStringFieldType, isStringType } from '../types/field-types/string-parser';
import { getUuidFieldType, isUuidType } from '../types/field-types/uuid-parser';
import type { FieldTypeEntry } from './types';

/**
 * Every built-in field type. A user-defined object, tuple, literal or enum name is not here: those
 * names come from the schema being parsed, so `parseFieldType` resolves them after this list.
 * The order is the order the parser tried the types in before they were data.
 */
const FIELD_TYPES: readonly FieldTypeEntry[] = [
  {
    name: 'String',
    constructId: 'type.string',
    fieldType: getStringFieldType(),
    description: 'Plain text values for names, descriptions and any textual content.',
    match: (_token, base) => isStringType(base),
  },
  {
    name: 'Email',
    constructId: 'type.email',
    fieldType: getEmailFieldType(),
    description: 'Text stored as a string, with SurrealDB enforcing the email format.',
    match: (_token, base) => isEmailType(base),
  },
  {
    name: 'Int',
    constructId: 'type.int',
    fieldType: getIntFieldType(),
    description: 'Whole numbers only; a decimal is truncated by SurrealDB.',
    match: (_token, base) => isIntType(base),
  },
  {
    name: 'Date',
    constructId: 'type.date',
    fieldType: getDateFieldType(),
    description: 'A datetime stored as a SurrealDB datetime and read as a JavaScript Date.',
    match: (_token, base) => isDateType(base),
  },
  {
    name: 'Bool',
    constructId: 'type.bool',
    fieldType: getBoolFieldType(),
    description: 'A true or false value for flags and toggles.',
    match: (_token, base) => isBoolType(base),
  },
  {
    name: 'Float',
    constructId: 'type.float',
    fieldType: getFloatFieldType(),
    description: 'An IEEE 754 double-precision floating-point number.',
    match: (_token, base) => isFloatType(base),
  },
  {
    name: 'Number',
    constructId: 'type.number',
    fieldType: getNumberFieldType(),
    description: 'An auto-detected numeric type that accepts both integers and decimals.',
    match: (_token, base) => isNumberType(base),
  },
  ...SIZED_NUMBER_TYPES.map((t): FieldTypeEntry => ({
    name: t.name,
    constructId: t.constructId,
    fieldType: t.fieldType,
    description: `A fixed-width number stored as SurrealDB ${t.surreal}; values outside its range are refused before sending.`,
    match: (_token, base) => base === t.name,
  })),
  {
    name: 'Uuid',
    constructId: 'type.uuid',
    fieldType: getUuidFieldType(),
    description: 'A UUID, read as a CerialUuid. Pair with @uuid, @uuid4 or @uuid7 to generate it.',
    match: (_token, base) => isUuidType(base),
  },
  {
    name: 'Duration',
    constructId: 'type.duration',
    fieldType: getDurationFieldType(),
    description: 'A length of time, read as a CerialDuration with unit accessors.',
    match: (_token, base) => isDurationType(base),
  },
  {
    name: 'Decimal',
    constructId: 'type.decimal',
    fieldType: getDecimalFieldType(),
    description: 'An arbitrary-precision decimal, read as a CerialDecimal, for financial calculations.',
    match: (_token, base) => isDecimalType(base),
  },
  {
    name: 'Bytes',
    constructId: 'type.bytes',
    fieldType: getBytesFieldType(),
    description: 'Binary data, read as a CerialBytes with base64, Uint8Array and Buffer conversion.',
    match: (_token, base) => isBytesType(base),
  },
  {
    name: 'Geometry',
    constructId: 'type.geometry',
    fieldType: getGeometryFieldType(),
    description: 'GeoJSON-compatible geospatial data with seven subtypes, narrowed by the geometry decorators.',
    match: (_token, base) => isGeometryType(base),
  },
  {
    name: 'Any',
    constructId: 'type.any',
    fieldType: getAnyFieldType(),
    description: 'Any SurrealDB value, typed as the recursive CerialAny union.',
    match: (_token, base) => isAnyType(base),
  },
  {
    name: 'Record',
    constructId: 'recordid.untyped',
    fieldType: getRecordFieldType(),
    description: 'A reference to another record: a foreign key, or the model id. Record(Type) types the id.',
    match: (token) => isRecordType(token),
  },
  {
    name: 'Relation',
    constructId: 'complex.relation',
    fieldType: getRelationFieldType(),
    description: 'A virtual field that traverses a link between models. It stores nothing.',
    match: (token) => isRelationType(token),
  },
];

/** Every built-in field type, keyed by its name as written in a schema. */
export const FIELD_TYPE_REGISTRY: ReadonlyMap<string, FieldTypeEntry> = new Map(
  FIELD_TYPES.map((entry) => [entry.name, entry]),
);

/**
 * Resolve a type token such as `String`, `Uuid[]` or `Record(int)[]` to its entry. The token is tried
 * against each entry in registration order, as the parser did; undefined means it is not a built-in type.
 */
export function matchFieldTypeToken(token: string): FieldTypeEntry | undefined {
  const base = token.replace('[]', '');

  return FIELD_TYPES.find((entry) => entry.match(token, base));
}
