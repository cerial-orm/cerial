import { type CerialClient, tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

export const SIZED_TABLES = tables.sizedNumbers;

export type Row = Record<string, unknown>;
type Args = Record<string, unknown>;

/**
 * The nine Sz{Type} models share one field layout and differ only in name, so the suites drive them
 * through this one structural view. The generated per-model types are exercised in typed-surface.test.ts
 * and in the typecheck file; here the data is deliberately loose so a test can also hand over values
 * the types forbid (a string, a bigint on a Uint8) and watch the runtime refuse them.
 */
export interface SizedApi {
  create(args: Args): PromiseLike<Row>;
  findOne(args?: Args): PromiseLike<Row | null>;
  findMany(args?: Args): PromiseLike<Row[]>;
  updateUnique(args: Args): PromiseLike<Row | null>;
  updateMany(args: Args): PromiseLike<Row[]>;
  upsert(args: Args): PromiseLike<Row>;
  deleteMany(args: Args): PromiseLike<number>;
  count(where?: Args): PromiseLike<number>;
}

export interface SizedSpec {
  /** DSL name, as it appears in messages. */
  readonly name: string;
  /** Client accessor, e.g. SzUint8. */
  readonly model: string;
  readonly kind: 'int' | 'u64' | 'float';
  /** Integer kinds: inclusive range. */
  readonly min?: bigint;
  readonly max?: bigint;
  /** The schema's `@default`. */
  readonly dflt: number;
}

export const INT_SPECS: readonly SizedSpec[] = [
  { name: 'Int8', model: 'SzInt8', kind: 'int', min: -128n, max: 127n, dflt: -5 },
  { name: 'Uint8', model: 'SzUint8', kind: 'int', min: 0n, max: 255n, dflt: 7 },
  { name: 'Int16', model: 'SzInt16', kind: 'int', min: -32768n, max: 32767n, dflt: -40 },
  { name: 'Uint16', model: 'SzUint16', kind: 'int', min: 0n, max: 65535n, dflt: 300 },
  { name: 'Int32', model: 'SzInt32', kind: 'int', min: -2147483648n, max: 2147483647n, dflt: -70000 },
  { name: 'Uint32', model: 'SzUint32', kind: 'int', min: 0n, max: 4294967295n, dflt: 70000 },
];
export const U64_SPEC: SizedSpec = {
  name: 'Uint64',
  model: 'SzUint64',
  kind: 'u64',
  min: 0n,
  max: 18446744073709551615n,
  dflt: 5,
};
export const FLOAT_SPECS: readonly SizedSpec[] = [
  { name: 'Float16', model: 'SzFloat16', kind: 'float', dflt: 1.5 },
  { name: 'Float32', model: 'SzFloat32', kind: 'float', dflt: 2.5 },
];
export const ALL_SPECS: readonly SizedSpec[] = [...INT_SPECS, U64_SPEC, ...FLOAT_SPECS];
/** Every kind whose values are whole numbers. */
export const WHOLE_SPECS: readonly SizedSpec[] = [...INT_SPECS, U64_SPEC];

/** The one place the generated accessor is viewed as the shared structural shape. */
export function api(client: CerialClient, spec: SizedSpec): SizedApi {
  return (client.db as unknown as Record<string, SizedApi>)[spec.model]!;
}

/** What a read of the number `n` looks like: a bigint on Uint64, a number elsewhere. */
export function read(spec: SizedSpec, n: number | bigint): number | bigint {
  return spec.kind === 'u64' ? BigInt(n) : Number(n);
}

/** Data for a create: every required field set from `n`, with `over` replacing any of them. */
export function data(n: number | bigint, over: Row = {}): Row {
  return { reqVal: n, nullVal: null, arrVal: [], setVal: [], objVal: { val: n }, tupVal: [n, null], ...over };
}

export function setup(): { getClient: () => CerialClient } {
  return setupDataTypeTests(SIZED_TABLES);
}

/** Awaits a query that must reject, returning the error so the test can read its message. */
export async function rejection(run: () => PromiseLike<unknown>): Promise<Error> {
  try {
    await run();
  } catch (error) {
    return error as Error;
  }
  throw new Error('expected the query to reject');
}

/** The fragment of a range message after the type name, e.g. `holds 0 to 255`. */
export function holds(spec: SizedSpec): string {
  if (spec.kind === 'float')
    return spec.name === 'Float16' ? 'holds at most ±65504' : 'holds at most ±3.4028234663852886e+38';

  return `holds ${spec.min} to ${spec.max}`;
}

/** The first integer below the range as an input (a bigint only when a number could not carry it). */
export function below(spec: SizedSpec): number {
  return Number(spec.min! - 1n);
}

/** The first integer above the range: a bigint on Uint64, whose limit no number can hold. */
export function above(spec: SizedSpec): number | bigint {
  return spec.kind === 'u64' ? spec.max! + 1n : Number(spec.max! + 1n);
}

/** Past the finite range of a float kind. */
export function overflow(spec: SizedSpec): number {
  return spec.name === 'Float16' ? 70000 : 1e39;
}

/** A value past the end of the range, whatever the kind. */
export function outOfRange(spec: SizedSpec): number | bigint {
  return spec.kind === 'float' ? overflow(spec) : above(spec);
}
