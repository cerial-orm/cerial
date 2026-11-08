import { createCompileContext } from '../../../../src/query/compile/var-allocator';
import { buildConditions } from '../../../../src/query/filters/condition-builder';
import { SIZED_NUMBER_TYPES } from '../../../../src/parser/types/field-types/sized-number-parser';
import type { SchemaFieldType } from '../../../../src/types';
import { elem, field, model, tupleInfo } from '../helpers';

/** Each sized type with the DSL name the messages use and a value inside and just outside its range. */
export const SIZED_CASES: ReadonlyArray<{
  type: SchemaFieldType;
  name: string;
  min: number;
  max: number;
  below: number;
  above: number;
}> = [
  { type: 'int8', name: 'Int8', min: -128, max: 127, below: -129, above: 128 },
  { type: 'uint8', name: 'Uint8', min: 0, max: 255, below: -1, above: 256 },
  { type: 'int16', name: 'Int16', min: -32768, max: 32767, below: -32769, above: 32768 },
  { type: 'uint16', name: 'Uint16', min: 0, max: 65535, below: -1, above: 65536 },
  { type: 'int32', name: 'Int32', min: -2147483648, max: 2147483647, below: -2147483649, above: 2147483648 },
  { type: 'uint32', name: 'Uint32', min: 0, max: 4294967295, below: -1, above: 4294967296 },
];

export const U64_MAX = 2n ** 64n - 1n;

/** The type list the helpers must cover, so a tenth sized type fails here rather than going untested. */
export const ALL_SIZED_TYPES: string[] = SIZED_NUMBER_TYPES.map((t) => t.fieldType);

/** A model holding one required, one optional and one array field of the given type, plus an object and a tuple. */
export function sizedModel(type: SchemaFieldType) {
  return model('Reading', [
    field({ name: 'id', type: 'record', isId: true }),
    field({ name: 'value', type, isRequired: true }),
    field({ name: 'maybe', type, isRequired: false, isNullable: true }),
    field({ name: 'list', type, isRequired: true, isArray: true }),
    field({
      name: 'calib',
      type: 'object',
      isRequired: true,
      objectInfo: { objectName: 'Calib', fields: [field({ name: 'gain', type, isRequired: true })] },
    }),
    field({
      name: 'pair',
      type: 'tuple',
      isRequired: true,
      tupleInfo: tupleInfo('Pair', [elem({ index: 0, type, name: 'first' }), elem({ index: 1, type, name: 'second' })]),
    }),
  ]);
}

/** Compile a where against the model and return its text and bound values. */
export function compileWhere(type: SchemaFieldType, where: Record<string, unknown>) {
  const ctx = createCompileContext();
  const fragment = buildConditions(ctx, where, sizedModel(type));

  return { text: fragment.text, values: Object.values(fragment.vars) };
}
