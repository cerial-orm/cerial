import { describe, expect, test } from 'bun:test';
import { RecordId } from 'surrealdb';
import { CerialValidationError } from '../../../../src/errors';
import { compileFragment, createCompileContext, sql } from '../../../../src/query';
import { generateVarName, createVarAllocator } from '../../../../src/query/compile';
import { getRegisteredOperators, isRegisteredOperator } from '../../../../src/query/filters';
import {
  CerialBytes,
  CerialDecimal,
  CerialDuration,
  CerialGeometry,
  CerialId,
  CerialUuid,
} from '../../../../src/utils';

describe('compileFragment', () => {
  test('binds every hole as raw_param_<n> and keeps the static text', () => {
    const out = compileFragment(sql`a = ${1} AND b = ${'x'}`, createCompileContext());

    expect(out.text).toBe('a = $raw_param_0 AND b = $raw_param_1');
    expect(out.vars).toEqual({ raw_param_0: 1, raw_param_1: 'x' });
  });

  test('a hostile string is bound, never spliced', () => {
    const payload = "x'; DELETE victim; --";
    const out = compileFragment(sql`name = ${payload}`, createCompileContext());

    expect(out.text).toBe('name = $raw_param_0');
    expect(out.vars).toEqual({ raw_param_0: payload });
  });

  test('a nested fragment splices with the same context, so names do not repeat', () => {
    const out = compileFragment(sql`a = ${1} AND (${sql`b = ${2} OR c = ${3}`}) AND d = ${4}`, createCompileContext());

    expect(out.text).toBe('a = $raw_param_0 AND (b = $raw_param_1 OR c = $raw_param_2) AND d = $raw_param_3');
    expect(Object.keys(out.vars)).toEqual(['raw_param_0', 'raw_param_1', 'raw_param_2', 'raw_param_3']);
  });

  test('sql.ident and sql.int splice and bind nothing', () => {
    const out = compileFragment(sql`${sql.ident('my field')} > ${sql.int(3)}`, createCompileContext());

    expect(out.text).toBe('`my field` > 3');
    expect(out.vars).toEqual({});
  });

  test('an include context prefixes the names and the counter is shared across calls', () => {
    const ctx = createCompileContext('inc_');
    const first = compileFragment(sql`a = ${1}`, ctx);
    const second = compileFragment(sql`b = ${2}`, ctx);

    expect(first.vars).toEqual({ inc_raw_param_0: 1 });
    expect(second.vars).toEqual({ inc_raw_param_1: 2 });
  });

  test('refuses a value that is not a fragment', () => {
    const ctx = createCompileContext();

    expect(() => compileFragment({ strings: ['true'], values: [] } as never, ctx)).toThrow(CerialValidationError);
    expect(() => compileFragment('true' as never, ctx)).toThrow(CerialValidationError);
  });
});

describe('compileFragment: wrappers are unwrapped before binding', () => {
  const bound = (value: unknown) => compileFragment(sql`${value}`, createCompileContext()).vars.raw_param_0;

  test('CerialId becomes a RecordId', () => {
    const value = bound(new CerialId('sid', 'u'));

    expect(value).toBeInstanceOf(RecordId);
    expect(String(value)).toBe('u:sid');
  });

  test('CerialUuid, CerialDuration, CerialDecimal, CerialBytes and geometry become driver values', () => {
    const uuid = new CerialUuid('550e8400-e29b-41d4-a716-446655440000');
    const duration = new CerialDuration('1h30m');
    const decimal = new CerialDecimal('1.5');
    const bytes = new CerialBytes(new Uint8Array([1, 2]));
    const point = CerialGeometry.from({ type: 'Point', coordinates: [1, 2] });

    expect(bound(uuid)).toEqual(uuid.toNative());
    expect(bound(duration)).toEqual(duration.toNative());
    expect(bound(decimal)).toEqual(decimal.toNative());
    expect(bound(bytes)).toEqual(bytes.toNative());
    expect(bound(point)).toEqual(point.toNative());
    for (const wrapper of [uuid, duration, decimal, bytes, point]) expect(bound(wrapper)).not.toBe(wrapper);
  });

  test('wrappers inside arrays and plain objects are unwrapped recursively', () => {
    const id = new CerialId('sid', 'u');
    const value = bound({ ids: [id, { deep: id }], keep: 'x', n: 1 }) as {
      ids: unknown[];
      keep: string;
      n: number;
    };

    expect(value.ids[0]).toBeInstanceOf(RecordId);
    expect((value.ids[1] as { deep: unknown }).deep).toBeInstanceOf(RecordId);
    expect(value.keep).toBe('x');
    expect(value.n).toBe(1);
  });

  test('scalars, null, dates and driver values pass through', () => {
    const date = new Date(0);
    const rid = new RecordId('u', 'a');

    expect(bound(null)).toBeNull();
    expect(bound(5)).toBe(5);
    expect(bound(date)).toBe(date);
    expect(bound(rid)).toBe(rid);
  });
});

describe('compileFragment: bound names cannot collide with generated names', () => {
  test('param is not a registered operator', () => {
    expect(isRegisteredOperator('param')).toBe(false);
  });

  test('no registered operator makes a generated name equal to raw_param_0', () => {
    for (const operator of getRegisteredOperators()) {
      expect(generateVarName(createVarAllocator(), 'raw', operator)).not.toBe('raw_param_0');
    }
  });

  test('a where allocator and an inc_ allocator share no name', () => {
    const where = compileFragment(sql`a = ${1}`, createCompileContext()).vars;
    const include = compileFragment(sql`a = ${1}`, createCompileContext('inc_')).vars;

    expect(Object.keys(where)).toEqual(['raw_param_0']);
    expect(Object.keys(include)).toEqual(['inc_raw_param_0']);
  });

  test('a field named raw_param cannot produce raw_param_0', () => {
    const names = getRegisteredOperators().map((op) => generateVarName(createVarAllocator(), 'raw_param', op));

    expect(names).not.toContain('raw_param_0');
  });
});
