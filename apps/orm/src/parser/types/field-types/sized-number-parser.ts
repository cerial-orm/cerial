import type { SchemaFieldType } from '../../../types';

/** The sized number field types: DSL name, `SchemaFieldType`, SurrealDB kind and manifest id. */
export const SIZED_NUMBER_TYPES = [
  { name: 'Int8', fieldType: 'int8', surreal: 'i8', constructId: 'type.int8' },
  { name: 'Uint8', fieldType: 'uint8', surreal: 'u8', constructId: 'type.uint8' },
  { name: 'Int16', fieldType: 'int16', surreal: 'i16', constructId: 'type.int16' },
  { name: 'Uint16', fieldType: 'uint16', surreal: 'u16', constructId: 'type.uint16' },
  { name: 'Int32', fieldType: 'int32', surreal: 'i32', constructId: 'type.int32' },
  { name: 'Uint32', fieldType: 'uint32', surreal: 'u32', constructId: 'type.uint32' },
  { name: 'Uint64', fieldType: 'uint64', surreal: 'u64', constructId: 'type.uint64' },
  { name: 'Float16', fieldType: 'float16', surreal: 'f16', constructId: 'type.float16' },
  { name: 'Float32', fieldType: 'float32', surreal: 'f32', constructId: 'type.float32' },
] as const satisfies readonly {
  name: string;
  fieldType: SchemaFieldType;
  surreal: string;
  constructId: string;
}[];

export type SizedNumberFieldType = (typeof SIZED_NUMBER_TYPES)[number]['fieldType'];

/** True for the exact, case-sensitive DSL name of a sized number type. */
export function isSizedNumberType(token: string): boolean {
  return SIZED_NUMBER_TYPES.some((t) => t.name === token);
}

export function getSizedNumberFieldType(token: string): SizedNumberFieldType | null {
  return SIZED_NUMBER_TYPES.find((t) => t.name === token)?.fieldType ?? null;
}
