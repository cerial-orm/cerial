/**
 * Range checks for the sized number types. The database refuses a value outside a kind's range, so
 * Cerial refuses it first and names the field and the range instead of the server's coerce text.
 */

import type { SchemaFieldType } from '../../types';
import { SIZED_NUMBER_TYPES, type SizedNumberFieldType } from '../../parser/types/field-types/sized-number-parser';

interface IntegerRange {
  readonly min: bigint;
  readonly max: bigint;
}

const INTEGER_RANGES: Partial<Record<SchemaFieldType, IntegerRange>> = {
  int8: { min: -(2n ** 7n), max: 2n ** 7n - 1n },
  uint8: { min: 0n, max: 2n ** 8n - 1n },
  int16: { min: -(2n ** 15n), max: 2n ** 15n - 1n },
  uint16: { min: 0n, max: 2n ** 16n - 1n },
  int32: { min: -(2n ** 31n), max: 2n ** 31n - 1n },
  uint32: { min: 0n, max: 2n ** 32n - 1n },
  uint64: { min: 0n, max: 2n ** 64n - 1n },
};

/** Largest finite value of each float kind, and the magnitude from which a finite input rounds to Infinity. */
const FLOAT_LIMITS: Partial<Record<SchemaFieldType, { readonly max: number; readonly overflowsAt: number }>> = {
  float16: { max: 65504, overflowsAt: 65520 },
  float32: { max: 3.4028234663852886e38, overflowsAt: 3.4028235677973366e38 },
};

const DISPLAY_NAMES: Record<string, string> = Object.fromEntries(SIZED_NUMBER_TYPES.map((t) => [t.fieldType, t.name]));

/** True for the nine sized number field types. */
export function isSizedNumberFieldType(type: SchemaFieldType): type is SizedNumberFieldType {
  return type in DISPLAY_NAMES;
}

/**
 * Why a value is not valid for a sized number field, or null when it is valid or not a number at all
 * (the type check reports that). `label` is the field path, with `[index]` for an element.
 * NaN is left to the type check and an infinite float passes, as they do for `Float`.
 */
export function sizedNumberError(type: SchemaFieldType, label: string, value: unknown): string | null {
  if (!isSizedNumberFieldType(type)) return null;
  if (typeof value !== 'number' && typeof value !== 'bigint') return null;
  if (typeof value === 'number' && Number.isNaN(value)) return null;

  const name = DISPLAY_NAMES[type]!;
  const prefix = `Field "${label}" is ${name}`;
  const float = FLOAT_LIMITS[type];

  if (float) {
    if (typeof value === 'bigint') return `${prefix} and expects a number, got a bigint`;
    if (!Number.isFinite(value) || Math.abs(value) < float.overflowsAt) return null;

    return `${prefix} and holds at most ±${float.max}, got ${value}`;
  }

  const range = INTEGER_RANGES[type]!;
  const holds = `${prefix} and holds ${range.min} to ${range.max}, got`;

  if (typeof value === 'bigint') {
    if (type !== 'uint64') return `${prefix} and expects a number, got a bigint`;

    return value < range.min || value > range.max ? `${holds} ${value}` : null;
  }

  if (!Number.isInteger(value)) return `${prefix} and expects a whole number, got ${value}`;
  const whole = BigInt(value);
  if (whole < range.min || whole > range.max) return `${holds} ${value}`;
  if (type === 'uint64' && !Number.isSafeInteger(value))
    return `${prefix}: ${value} is past Number.MAX_SAFE_INTEGER and may already be rounded; pass a bigint`;

  return null;
}
