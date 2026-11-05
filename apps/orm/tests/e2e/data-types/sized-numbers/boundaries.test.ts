import { describe, expect, test } from 'bun:test';
import { CerialValidationError } from 'cerial';
import {
  ALL_SPECS,
  FLOAT_SPECS,
  INT_SPECS,
  type Row,
  WHOLE_SPECS,
  U64_SPEC,
  above,
  api,
  below,
  data,
  holds,
  overflow,
  read,
  rejection,
  setup,
} from './helpers';

/** Every field form, each building a create body that puts `v` in exactly that place. */
const FORMS: ReadonlyArray<{
  path: string;
  body: (v: number | bigint) => Row;
  /** A set stores sorted, so reading an edge back needs a body that puts it at a known index. */
  stored?: { path: string; body: (v: number | bigint) => Row };
}> = [
  { path: 'reqVal', body: (v) => data(1, { reqVal: v }) },
  { path: 'optVal', body: (v) => data(1, { optVal: v }) },
  { path: 'nullVal', body: (v) => data(1, { nullVal: v }) },
  { path: 'arrVal[1]', body: (v) => data(1, { arrVal: [1, v] }) },
  {
    path: 'setVal[1]',
    body: (v) => data(1, { setVal: [1, v] }),
    stored: { path: 'setVal[0]', body: (v) => data(1, { setVal: [v] }) },
  },
  { path: 'dfltVal', body: (v) => data(1, { dfltVal: v }) },
  { path: 'objVal.val', body: (v) => data(1, { objVal: { val: v } }) },
  { path: 'objVal.opt', body: (v) => data(1, { objVal: { val: 1, opt: v } }) },
  { path: 'tupVal[0]', body: (v) => data(1, { tupVal: [v, null] }) },
  { path: 'tupVal[1]', body: (v) => data(1, { tupVal: [1, v] }) },
];

/** Walks a form's path (`objVal.val`, `arrVal[1]`) through a read row. */
function valueAt(row: Row, path: string): unknown {
  return path
    .split(/[.[\]]+/)
    .filter(Boolean)
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], row);
}

describe('E2E sized numbers: range and type refusals', () => {
  const { getClient } = setup();
  const refusal = async (spec: (typeof ALL_SPECS)[number], body: Row): Promise<Error> => {
    const error = await rejection(() => api(getClient(), spec).create({ data: body }));

    expect(error).toBeInstanceOf(CerialValidationError);
    expect(await api(getClient(), spec).count()).toBe(0);

    return error;
  };

  describe.each(WHOLE_SPECS)('$name: both ends of the range are stored', (spec) => {
    const lo = spec.kind === 'u64' ? spec.min! : Number(spec.min);
    const hi = spec.kind === 'u64' ? spec.max! : Number(spec.max);

    test.each(FORMS)('$path holds the minimum and the maximum', async (form) => {
      const { path, body } = form.stored ?? form;

      for (const edge of [lo, hi]) {
        const row = await api(getClient(), spec).create({ data: body(edge) });
        const found = await api(getClient(), spec).findOne({ where: { id: row.id } });

        expect(valueAt(found!, path)).toBe(read(spec, edge));
        expect(valueAt(row, path)).toBe(read(spec, edge));
      }
    });

    test('the stored value reads back exactly', async () => {
      const lowRow = await api(getClient(), spec).create({ data: data(lo) });
      const highRow = await api(getClient(), spec).create({ data: data(hi) });

      expect((await api(getClient(), spec).findOne({ where: { id: lowRow.id } }))!.reqVal).toBe(read(spec, lo));
      expect((await api(getClient(), spec).findOne({ where: { id: highRow.id } }))!.reqVal).toBe(read(spec, hi));
    });
  });

  describe.each(WHOLE_SPECS)('$name: one past each end is refused', (spec) => {
    test.each(FORMS)('$path above the maximum names the field and the range', async ({ path, body }) => {
      const error = await refusal(spec, body(above(spec)));

      expect(error.message).toBe(
        `Invalid data: Field "${path}" is ${spec.name} and ${holds(spec)}, got ${above(spec)}`,
      );
    });

    test.each(FORMS)('$path below the minimum names the field and the range', async ({ path, body }) => {
      const error = await refusal(spec, body(below(spec)));

      expect(error.message).toBe(
        `Invalid data: Field "${path}" is ${spec.name} and ${holds(spec)}, got ${below(spec)}`,
      );
    });

    test('the error carries the model, the operation and the field', async () => {
      const error = (await refusal(spec, data(1, { reqVal: above(spec) }))) as CerialValidationError;

      expect(error.model).toBe(spec.model);
      expect(error.operation).toBe('create');
      expect(error.field).toBe('reqVal');
    });

    test('a refused element writes nothing, even beside valid ones', async () => {
      await refusal(spec, data(1, { arrVal: [1, 2, above(spec), 3] }));
    });
  });

  describe.each(WHOLE_SPECS)('$name: a fraction is refused', (spec) => {
    test.each(FORMS)('$path rejects 1.5', async ({ path, body }) => {
      const error = await refusal(spec, body(1.5));

      expect(error.message).toBe(`Invalid data: Field "${path}" is ${spec.name} and expects a whole number, got 1.5`);
    });
  });

  describe.each([...INT_SPECS, ...FLOAT_SPECS])('$name: a bigint is refused', (spec) => {
    test.each(FORMS)('$path rejects 5n', async ({ path, body }) => {
      const error = await refusal(spec, body(5n));

      expect(error.message).toBe(`Invalid data: Field "${path}" is ${spec.name} and expects a number, got a bigint`);
    });
  });

  describe.each(ALL_SPECS)('$name: a non-number is refused', (spec) => {
    test.each([['5'], [true], [{}], [[]]])('%p', async (bad) => {
      const error = await refusal(spec, data(1, { reqVal: bad }));

      expect(error.message).toContain('reqVal must be of type');
    });
  });

  describe('Uint64: a number must be a safe integer', () => {
    test.each([2 ** 53, 2 ** 53 + 2, 2 ** 63, 1e19])('%p is refused with a hint to pass a bigint', async (unsafe) => {
      const error = await refusal(U64_SPEC, data(1, { reqVal: unsafe }));

      expect(error.message).toContain(`Field "reqVal" is Uint64: ${unsafe} is past Number.MAX_SAFE_INTEGER`);
      expect(error.message).toContain('pass a bigint');
    });

    test('Number.MAX_SAFE_INTEGER is accepted and reads back exactly', async () => {
      const row = await api(getClient(), U64_SPEC).create({ data: data(Number.MAX_SAFE_INTEGER) });

      expect(row.reqVal).toBe(BigInt(Number.MAX_SAFE_INTEGER));
    });

    test('an out-of-range number is refused as out of range, not as unsafe', async () => {
      const error = await refusal(U64_SPEC, data(1, { reqVal: -1 }));

      expect(error.message).toContain('holds 0 to 18446744073709551615, got -1');
    });

    test('the maximum passed as a number is refused: it already rounded to 2^64', async () => {
      const error = await refusal(U64_SPEC, data(1, { reqVal: 2 ** 64 }));

      expect(error.message).toContain('Field "reqVal" is Uint64');
    });
  });

  describe.each(FLOAT_SPECS)('$name: finite range', (spec) => {
    const max = spec.name === 'Float16' ? 65504 : 3.4028234663852886e38;
    const threshold = spec.name === 'Float16' ? 65520 : 3.4028235677973366e38;

    test.each(FORMS)('$path stores the largest finite value, positive and negative', async ({ body }) => {
      const high = await api(getClient(), spec).create({ data: body(max) });
      const low = await api(getClient(), spec).create({ data: body(-max) });

      expect(await api(getClient(), spec).findOne({ where: { id: high.id } })).not.toBeNull();
      expect(await api(getClient(), spec).findOne({ where: { id: low.id } })).not.toBeNull();
    });

    test('the largest value reads back as itself', async () => {
      const row = await api(getClient(), spec).create({ data: data(max) });

      expect(row.reqVal).toBe(max);
    });

    test.each(FORMS)(
      '$path refuses a value that rounds to infinity, naming field and limit',
      async ({ path, body }) => {
        for (const big of [overflow(spec), threshold, -threshold, -overflow(spec)]) {
          const error = await refusal(spec, body(big));

          expect(error.message).toBe(`Invalid data: Field "${path}" is ${spec.name} and ${holds(spec)}, got ${big}`);
        }
      },
    );

    test('a value just under the overflow threshold is stored, rounded to the largest finite value', async () => {
      const justUnder = spec.name === 'Float16' ? 65519 : 3.4028235e38;
      const row = await api(getClient(), spec).create({ data: data(justUnder) });

      expect(row.reqVal).toBe(max);
    });

    test('zero and a negative fraction are stored', async () => {
      const row = await api(getClient(), spec).create({ data: data(0, { optVal: -0.5 }) });

      expect(row.reqVal).toBe(0);
      expect(row.optVal).toBe(-0.5);
    });
  });
});
