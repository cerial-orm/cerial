/**
 * Facts about SurrealDB 4.0's sized numbers (`i8` to `u64`, `f16`, `f32`): which values each kind
 * stores, converts or refuses, the sized literals, sized kinds inside arrays, sets, objects and
 * tuples, comparison and ORDER BY, and what SDK 2.2.1 hands back over each CBOR dialect. Measured
 * on SurrealDB 4.0.0, memory backend, for the C1 design.
 *
 * The /sql JSON renders every sized value as a plain number, so a stored kind is read with
 * `type::of`. The protocol facts go through the SDK the way Cerial connects: `new Surreal()` with
 * no codec options, on `/rpc`.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { CborCodec, Decimal, F16, F32, I8, type SizedNumber, Surreal, U64, U8 } from 'surrealdb';
import { CERIAL_CODECS } from '../../../src/client/u64-codec';
import { run, withScratchDatabase, type ScratchDatabase } from './helpers';

const databases: ScratchDatabase[] = [];
const sockets: Surreal[] = [];

async function scratch(name: string): Promise<ScratchDatabase> {
  const db = await withScratchDatabase(name);
  databases.push(db);

  return db;
}

afterAll(async () => {
  await Promise.all(sockets.map((s) => s.close()));
  await Promise.all(databases.map((db) => db.remove()));
});

/** Runs one statement and returns its result, asserting only that it was OK. */
async function ok(db: ScratchDatabase, surql: string): Promise<unknown> {
  const [r] = await run(db, surql);
  expect(r!.status).toBe('OK');

  return r!.result;
}

/** Runs one statement and returns the error text, asserting it failed. */
async function err(db: ScratchDatabase, surql: string): Promise<string> {
  const [r] = await run(db, surql);
  expect(r!.status).toBe('ERR');

  return String(r!.result);
}

/** Reads one expression of one record as its `type::of` name. */
async function typeOf(db: ScratchDatabase, expr: string, record: string): Promise<unknown> {
  const rows = (await ok(db, `SELECT type::of(${expr}) AS t FROM ${record};`)) as { t: string }[];

  return rows[0]!.t;
}

/**
 * Connects with the SDK's default codecs; `dialect1` swaps in a plain `cbor` codec to force the old dialect,
 * and `cerial` uses the codecs Cerial connects with.
 */
async function connect(
  db: ScratchDatabase,
  options: { dialect1?: boolean; http?: boolean; cerial?: boolean } = {},
): Promise<Surreal> {
  const surreal = options.dialect1
    ? new Surreal({ codecs: { cbor: () => new CborCodec({}) } })
    : new Surreal(options.cerial ? { codecs: CERIAL_CODECS } : {});
  await surreal.connect(options.http ? 'http://127.0.0.1:8000/rpc' : 'ws://127.0.0.1:8000/rpc');
  await surreal.signin({ username: 'root', password: 'root' });
  await surreal.use({ namespace: 'main', database: db.name });
  sockets.push(surreal);

  return surreal;
}

/** Runs one statement through the SDK and returns its single result. */
async function sdk(surreal: Surreal, surql: string, vars?: Record<string, unknown>): Promise<unknown> {
  const [result] = await surreal.query(surql, vars).collect();

  return result;
}

async function sdkError(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
  } catch (error) {
    return (error as Error).message;
  }

  throw new Error('expected the call to throw');
}

const RANGES: readonly [kind: string, min: string, max: string, below: string, above: string][] = [
  ['i8', '-128', '127', '-129', '128'],
  ['u8', '0', '255', '-1', '256'],
  ['i16', '-32768', '32767', '-32769', '32768'],
  ['u16', '0', '65535', '-1', '65536'],
  ['i32', '-2147483648', '2147483647', '-2147483649', '2147483648'],
  ['u32', '0', '4294967295', '-1', '4294967296'],
];

describe('integer kinds store their whole range and refuse one past each end', () => {
  for (const [kind, min, max, below, above] of RANGES) {
    test(`${kind}: ${min} and ${max} are stored as ${kind}; ${below} and ${above} are refused`, async () => {
      const db = await scratch(`range_${kind}`);
      await ok(db, `DEFINE TABLE t SCHEMAFULL; DEFINE FIELD v ON t TYPE option<${kind}>;`);
      await ok(db, `CREATE t:min SET v = ${min};`);
      await ok(db, `CREATE t:max SET v = ${max};`);

      expect(await typeOf(db, 'v', 't:min')).toBe(kind);
      expect(await typeOf(db, 'v', 't:max')).toBe(kind);
      expect(await err(db, `CREATE t:below SET v = ${below};`)).toBe(
        `Couldn't coerce value for field \`v\` of \`t:below\`: Expected \`none | ${kind}\` but found \`${below}\``,
      );
      expect(await err(db, `CREATE t:above SET v = ${above};`)).toBe(
        `Couldn't coerce value for field \`v\` of \`t:above\`: Expected \`none | ${kind}\` but found \`${above}\``,
      );
    });
  }

  test('u64 holds 0 to 2^64 - 1, past the signed range of int; -1 and 2^64 are refused', async () => {
    const db = await scratch('range_u64');
    await ok(db, 'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD v ON t TYPE option<u64>;');
    await ok(db, 'CREATE t:min SET v = 0;');
    await ok(db, 'CREATE t:max SET v = 18446744073709551615u64;');

    expect(await typeOf(db, 'v', 't:max')).toBe('u64');
    expect(await ok(db, 'SELECT VALUE <string>v FROM t:max;')).toEqual(['18446744073709551615u64']);
    expect(await err(db, 'CREATE t:neg SET v = -1;')).toContain('Expected `none | u64` but found `-1`');
    expect(await err(db, 'CREATE t:over SET v = 18446744073709551616dec;')).toContain(
      'Expected `none | u64` but found `18446744073709551616dec`',
    );
  });

  test('a bare integer literal above the signed 64-bit range is a parse error; it needs the u64 suffix', async () => {
    const db = await scratch('u64_literal');

    await expect(run(db, 'RETURN 18446744073709551615;')).rejects.toThrow(
      'number cannot fit within a 64bit signed integer',
    );
    expect(await ok(db, 'RETURN type::of(18446744073709551615u64);')).toBe('u64');
  });

  test('a whole decimal within range is stored on u8 and u64; a fractional one is refused', async () => {
    const db = await scratch('dec_in');
    await ok(
      db,
      'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD b ON t TYPE option<u8>; DEFINE FIELD u ON t TYPE option<u64>;',
    );
    await ok(db, 'CREATE t:1 SET b = 7dec, u = 18446744073709551615dec;');

    expect(await typeOf(db, 'b', 't:1')).toBe('u8');
    expect(await typeOf(db, 'u', 't:1')).toBe('u64');
    expect(await err(db, 'CREATE t:2 SET b = 1.5dec;')).toContain('Expected `none | u8` but found `1.5dec`');
  });
});

describe('integer kinds convert a whole float and refuse a fractional one or a string', () => {
  test('1.0 is stored as u16 1; 1.5 and "3" are refused', async () => {
    const db = await scratch('int_conv');
    await ok(db, 'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD v ON t TYPE option<u16>;');
    await ok(db, 'CREATE t:1 SET v = 1.0;');

    expect(await ok(db, 'SELECT VALUE v FROM t:1;')).toEqual([1]);
    expect(await typeOf(db, 'v', 't:1')).toBe('u16');
    expect(await err(db, 'CREATE t:2 SET v = 1.5;')).toContain('Expected `none | u16` but found `1.5f`');
    expect(await err(db, 'CREATE t:3 SET v = "3";')).toContain("Expected `none | u16` but found `'3'`");
  });
});

describe('float kinds round silently within range and refuse beyond it', () => {
  test('f16 stores 0.1 as 0.0999755859375, 1e-8 as 0, and holds 65504', async () => {
    const db = await scratch('f16_round');
    await ok(db, 'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD h ON t TYPE option<f16>;');
    await ok(db, 'CREATE t:1 SET h = 0.1;');
    await ok(db, 'CREATE t:2 SET h = 0.00000001;');
    await ok(db, 'CREATE t:3 SET h = 65504;');

    expect(await ok(db, 'SELECT VALUE h FROM t ORDER BY id;')).toEqual([0.0999755859375, 0, 65504]);
    expect(await typeOf(db, 'h', 't:3')).toBe('f16');
  });

  test('f16 refuses 65520, which a cast would round to infinity', async () => {
    const db = await scratch('f16_over');
    await ok(db, 'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD h ON t TYPE option<f16>;');

    expect(await err(db, 'CREATE t:1 SET h = 65520;')).toContain('Expected `none | f16` but found `65520`');
  });

  test('f32 stores 16777217 as 16777216 and refuses 1e39', async () => {
    const db = await scratch('f32_round');
    await ok(db, 'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD f ON t TYPE option<f32>;');
    await ok(db, 'CREATE t:1 SET f = 16777217;');

    expect(await ok(db, 'SELECT VALUE f FROM t:1;')).toEqual([16777216]);
    expect(await err(db, 'CREATE t:2 SET f = 1e39;')).toContain('Expected `none | f32` but found');
  });

  test('f32 accepts NaN', async () => {
    const db = await scratch('f32_nan');
    await ok(db, 'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD f ON t TYPE option<f32>;');
    await ok(db, 'CREATE t:1 SET f = NaN;');

    expect(await ok(db, 'SELECT VALUE [<string>f, type::of(f)] FROM t:1;')).toEqual([['<f32>NaN', 'f32']]);
  });
});

describe('i64 and f64 are aliases, and the plain kinds widen a sized value', () => {
  test('INFO reports a field declared i64 as int and f64 as float', async () => {
    const db = await scratch('alias');
    await ok(db, 'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD a ON t TYPE i64; DEFINE FIELD b ON t TYPE f64;');
    const info = (await ok(db, 'INFO FOR TABLE t;')) as { fields: Record<string, string> };

    expect(info.fields.a).toBe('DEFINE FIELD a ON t TYPE int PERMISSIONS FULL');
    expect(info.fields.b).toBe('DEFINE FIELD b ON t TYPE float PERMISSIONS FULL');
    expect(await ok(db, 'RETURN [type::of(1i64), type::of(1f64)];')).toEqual(['int', 'float']);
  });

  test('an int field stores 5u8 as int and a float field 1.5f32 as float, but a number field keeps u16', async () => {
    const db = await scratch('widen');
    await ok(
      db,
      `DEFINE TABLE t SCHEMAFULL; DEFINE FIELD n ON t TYPE int; DEFINE FIELD f ON t TYPE float;
       DEFINE FIELD num ON t TYPE number;`,
    );
    await ok(db, 'CREATE t:1 SET n = 5u8, f = 1.5f32, num = 5u16;');

    expect(await ok(db, 'SELECT VALUE [type::of(n), type::of(f), type::of(num)] FROM t:1;')).toEqual([
      ['int', 'float', 'u16'],
    ]);
  });
});

describe('sized literals, casts and type checks', () => {
  test('255u8 and 1.5f32 are literals of their kind', async () => {
    const db = await scratch('literals');

    expect(await ok(db, 'RETURN [type::of(255u8), type::of(1.5f32)];')).toEqual(['u8', 'f32']);
  });

  test('256u8 is a parse error that fails the whole request', async () => {
    const db = await scratch('literal_over');

    await expect(run(db, 'RETURN 256u8;')).rejects.toThrow('number cannot fit within an 8bit unsigned integer');
  });

  test('a cast out of range is refused', async () => {
    const db = await scratch('cast');

    expect(await ok(db, 'RETURN type::of(<u8>3);')).toBe('u8');
    expect(await err(db, 'RETURN <u8>300;')).toBe('Could not cast into `u8` using input `300`');
    expect(await err(db, 'RETURN <i8>-129;')).toBe('Could not cast into `i8` using input `-129`');
  });

  test('type::is_u8 is true only for a u8; type::is_int and type::is_float are false for sized kinds', async () => {
    const db = await scratch('is');

    expect(
      await ok(
        db,
        'RETURN [type::is_u8(5u8), type::is_u8(5), type::is_int(5u8), type::is_number(5u8), type::is_float(1.5f32)];',
      ),
    ).toEqual([true, false, false, true, false]);
  });
});

describe('@default on a sized field', () => {
  test('a sized literal and a plain literal in range both default to the sized kind', async () => {
    const db = await scratch('default');
    await ok(
      db,
      `DEFINE TABLE t SCHEMAFULL;
       DEFINE FIELD a ON t TYPE u8 DEFAULT 255u8; DEFINE FIELD b ON t TYPE u8 DEFAULT 7;
       DEFINE FIELD c ON t TYPE f32 DEFAULT 1.5f32; DEFINE FIELD d ON t TYPE f32 DEFAULT 1.5;`,
    );
    await ok(db, 'CREATE t:1;');
    const info = (await ok(db, 'INFO FOR TABLE t;')) as { fields: Record<string, string> };

    expect(await ok(db, 'SELECT VALUE [type::of(a), type::of(b), type::of(c), type::of(d)] FROM t:1;')).toEqual([
      ['u8', 'u8', 'f32', 'f32'],
    ]);
    expect(info.fields.b).toBe('DEFINE FIELD b ON t TYPE u8 DEFAULT 7 PERMISSIONS FULL');
    expect(info.fields.d).toBe('DEFINE FIELD d ON t TYPE f32 DEFAULT 1.5f PERMISSIONS FULL');
  });

  test('DEFINE FIELD refuses a DEFAULT out of range or fractional for the kind', async () => {
    const db = await scratch('default_bad');
    await ok(db, 'DEFINE TABLE t SCHEMAFULL;');

    expect(await err(db, 'DEFINE FIELD k ON t TYPE u8 DEFAULT 300;')).toBe(
      'Cannot change field `k` of table `t`: its DEFAULT does not coerce to `u8`',
    );
    expect(await err(db, 'DEFINE FIELD k ON t TYPE option<u8> DEFAULT 300;')).toBe(
      'Cannot change field `k` of table `t`: its DEFAULT does not coerce to `none | u8`',
    );
    expect(await err(db, 'DEFINE FIELD g ON t TYPE i16 DEFAULT 1.5;')).toBe(
      'Cannot change field `g` of table `t`: its DEFAULT does not coerce to `i16`',
    );
  });

  test('a VALUE clause out of range is not checked at definition, only at write', async () => {
    const db = await scratch('value_bad');
    await ok(db, 'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD k ON t TYPE option<u8> VALUE 300;');

    expect(await err(db, 'CREATE t:1;')).toContain('Expected `none | u8` but found `300`');
  });
});

describe('sized kinds inside arrays, sets, objects and tuples', () => {
  const DEFINE = `DEFINE TABLE t SCHEMAFULL;
    DEFINE FIELD arr ON t TYPE option<array<u8>>;
    DEFINE FIELD st ON t TYPE option<set<i16>>;
    DEFINE FIELD o ON t TYPE option<object>;
    DEFINE FIELD o.x ON t TYPE u16;
    DEFINE FIELD tp ON t TYPE option<[u8, f32]>;`;

  test('array<u8> stores u8 elements; 256 is refused naming the index, or the whole array when optional', async () => {
    const db = await scratch('arr');
    await ok(db, DEFINE);
    await ok(db, 'DEFINE FIELD req ON t TYPE array<u8> DEFAULT [];');
    await ok(db, 'CREATE t:1 SET arr = [1, 2, 255];');

    expect(await typeOf(db, 'arr[0]', 't:1')).toBe('u8');
    expect(await err(db, 'CREATE t:2 SET req = [256];')).toBe(
      "Couldn't coerce value for field `req` of `t:2`: Expected `u8` but found `256` when coercing element at index 0 of `array<u8>`",
    );
    expect(await err(db, 'CREATE t:3 SET arr = [256];')).toBe(
      "Couldn't coerce value for field `arr` of `t:3`: Expected `none | array<u8>` but found `[256]`",
    );
  });

  test('set<i16> stores i16 elements and refuses -40000', async () => {
    const db = await scratch('set');
    await ok(db, DEFINE);
    await ok(db, 'CREATE t:1 SET st = [3, 1, 3];');

    expect(await ok(db, 'SELECT VALUE st FROM t:1;')).toEqual([[1, 3]]);
    expect(await typeOf(db, 'st[0]', 't:1')).toBe('i16');
    expect(await err(db, 'CREATE t:2 SET st = [-40000];')).toContain('Expected `none | set<i16>` but found `[-40000]`');
  });

  test('set<f16> dedupes after rounding and set<u64> holds values past the signed range', async () => {
    const db = await scratch('set_f16_u64');
    await ok(
      db,
      `DEFINE TABLE s SCHEMAFULL; DEFINE FIELD a ON s TYPE set<f16> DEFAULT <set>[];
       DEFINE FIELD b ON s TYPE set<u64> DEFAULT <set>[]; DEFINE FIELD c ON s TYPE option<u8 | null>;`,
    );
    await ok(db, 'CREATE s:1 SET a = [0.5, 0.5, 0.1], b = [3, 3, 18446744073709551615u64], c = NULL;');

    expect(await ok(db, 'SELECT VALUE [a, type::of(a[0]), type::of(b[1]), type::of(c)] FROM s:1;')).toEqual([
      [[0.0999755859375, 0.5], 'f16', 'u64', 'null'],
    ]);
  });

  test('an object sub-field of u16 stores u16 and refuses 70000 under its dotted name', async () => {
    const db = await scratch('obj');
    await ok(db, DEFINE);
    await ok(db, 'CREATE t:1 SET o = { x: 65535 };');

    expect(await typeOf(db, 'o.x', 't:1')).toBe('u16');
    expect(await err(db, 'CREATE t:2 SET o = { x: 70000 };')).toBe(
      "Couldn't coerce value for field `o.x` of `t:2`: Expected `u16` but found `70000`",
    );
  });

  test('a [u8, f32] tuple stores each element at its kind and refuses 256 naming the whole tuple', async () => {
    const db = await scratch('tuple');
    await ok(db, DEFINE);
    await ok(db, 'CREATE t:1 SET tp = [255, 2.5];');

    expect(await ok(db, 'SELECT VALUE [type::of(tp[0]), type::of(tp[1])] FROM t:1;')).toEqual([['u8', 'f32']]);
    expect(await err(db, 'CREATE t:2 SET tp = [256, 2.5];')).toContain(
      'Expected `none | [u8, f32]` but found `[256, 2.5f]`',
    );
  });
});

describe('comparison, ORDER BY and arithmetic', () => {
  async function seeded(name: string): Promise<ScratchDatabase> {
    const db = await scratch(name);
    await ok(
      db,
      `DEFINE TABLE c SCHEMAFULL; DEFINE FIELD v ON c TYPE u64; DEFINE FIELD h ON c TYPE f16; DEFINE FIELD s ON c TYPE i8;
       CREATE c:1 SET v = 18446744073709551615u64, h = 0.5, s = -5;
       CREATE c:2 SET v = 3, h = 2.5, s = 100;
       CREATE c:3 SET v = 9223372036854775808u64, h = -1, s = 0;`,
    );

    return db;
  }

  test('ORDER BY sorts u64 past the signed range, f16 and i8 numerically', async () => {
    const db = await seeded('order');

    expect(await ok(db, 'SELECT VALUE id FROM c ORDER BY v ASC;')).toEqual(['c:2', 'c:3', 'c:1']);
    expect(await ok(db, 'SELECT VALUE id FROM c ORDER BY h DESC;')).toEqual(['c:2', 'c:1', 'c:3']);
    expect(await ok(db, 'SELECT VALUE id FROM c ORDER BY s ASC;')).toEqual(['c:1', 'c:3', 'c:2']);
  });

  test('a sized field compares with a plain int, float and IN list', async () => {
    const db = await seeded('compare');

    expect(await ok(db, 'SELECT VALUE id FROM c WHERE v > 9223372036854775807 ORDER BY id;')).toEqual(['c:1', 'c:3']);
    expect(await ok(db, 'SELECT VALUE id FROM c WHERE s = 100 ORDER BY id;')).toEqual(['c:2']);
    expect(await ok(db, 'SELECT VALUE id FROM c WHERE s = 100.0 ORDER BY id;')).toEqual(['c:2']);
    expect(await ok(db, 'SELECT VALUE id FROM c WHERE h = 0.5 ORDER BY id;')).toEqual(['c:1']);
    expect(await ok(db, 'SELECT VALUE id FROM c WHERE s IN [100, -5] ORDER BY id;')).toEqual(['c:1', 'c:2']);
  });

  test('0.1f32 does not equal 0.1, so an equality filter on a rounded kind misses the written value', async () => {
    const db = await scratch('f32_eq');

    expect(await ok(db, 'RETURN [5u8 = 5, 1.5f32 = 1.5, 0.1f32 = 0.1];')).toEqual([true, true, false]);
  });

  test('a sized value plus an int is an int; two u8 stay u8 and overflow is an error', async () => {
    const db = await scratch('arith');

    expect(
      await ok(db, 'RETURN [type::of(5u8 + 1), type::of(250u8 + 10), type::of(5u8 + 1u8), type::of(1.5f32 * 2)];'),
    ).toEqual(['int', 'int', 'u8', 'float']);
    expect(await err(db, 'RETURN 255u8 + 1u8;')).toBe("Cannot perform addition with '255u8' and '1u8'");
  });

  test('an increment past the range is refused at write; one that lands in range is stored', async () => {
    const db = await seeded('increment');

    expect(await err(db, 'UPDATE c:2 SET s += 100;')).toContain('Expected `i8` but found `200`');
    expect(await ok(db, 'UPDATE c:2 SET s += 27 RETURN VALUE s;')).toEqual([127]);
  });
});

describe('SDK 2.2.1 over cbor.2, which a default connection negotiates with 4.0', () => {
  async function seeded(name: string): Promise<{ db: ScratchDatabase; surreal: Surreal }> {
    const db = await scratch(name);
    await ok(
      db,
      `DEFINE TABLE t SCHEMAFULL; DEFINE FIELD b ON t TYPE option<u8>; DEFINE FIELD s ON t TYPE option<i8>;
       DEFINE FIELD h ON t TYPE option<f16>; DEFINE FIELD f ON t TYPE option<f32>; DEFINE FIELD u ON t TYPE option<u64>;
       DEFINE FIELD arr ON t TYPE option<array<u8>>;
       CREATE t:1 SET b = 7, s = -5, h = 0.1, f = 0.1, u = 18446744073709551615u64, arr = [1, 2];
       CREATE t:2 SET u = 3;`,
    );

    return { db, surreal: await connect(db) };
  }

  test('reads every sized kind as its SizedNumber class, and u64 as a U64 holding a bigint', async () => {
    const { surreal } = await seeded('sdk2_read');
    const row = (await sdk(surreal, 'SELECT * FROM ONLY t:1;')) as Record<string, unknown>;
    const small = (await sdk(surreal, 'SELECT VALUE u FROM ONLY t:2;')) as U64;

    expect(row.b).toBeInstanceOf(U8);
    expect(row.s).toBeInstanceOf(I8);
    expect(row.h).toBeInstanceOf(F16);
    expect(row.u).toBeInstanceOf(U64);
    expect((row.u as U64).value).toBe(18446744073709551615n);
    expect(small).toBeInstanceOf(U64);
    expect(small.value).toBe(3n);
    expect((row.arr as unknown[])[0]).toBeInstanceOf(U8);
  });

  test('a SizedNumber is not a number: typeof is object, but valueOf gives the number', async () => {
    const { surreal } = await seeded('sdk2_value');
    const row = (await sdk(surreal, 'SELECT * FROM ONLY t:1;')) as Record<string, SizedNumber>;

    expect(typeof row.b).toBe('object');
    expect(row.b!.valueOf()).toBe(7);
    expect(row.h!.valueOf()).toBe(0.0999755859375);
    expect(row.f!.valueOf()).toBe(0.10000000149011612);
  });

  test('the HTTP engine negotiates cbor.2 too', async () => {
    const { db } = await seeded('sdk2_http');
    const http = await connect(db, { http: true });

    expect(await sdk(http, 'SELECT VALUE b FROM ONLY t:1;')).toBeInstanceOf(U8);
  });

  test('a JS number param is sent as int or float and the field converts it; out of range is refused', async () => {
    const { db, surreal } = await seeded('sdk2_params');

    expect(await sdk(surreal, 'RETURN [type::of($x), type::of($y)];', { x: 5, y: 1.5 })).toEqual(['int', 'float']);
    await sdk(surreal, 'CREATE t:3 SET b = $b, h = $h;', { b: 7, h: 0.1 });
    expect(await ok(db, 'SELECT VALUE [type::of(b), h] FROM t:3;')).toEqual([['u8', 0.0999755859375]]);
    expect(await sdkError(() => sdk(surreal, 'CREATE t:4 SET b = $b;', { b: 300 }))).toContain(
      'Expected `none | u8` but found `300`',
    );
    expect(await sdkError(() => sdk(surreal, 'CREATE t:5 SET b = $b;', { b: 1.5 }))).toContain(
      'Expected `none | u8` but found `1.5f`',
    );
  });

  test('a bigint above the signed 64-bit range is refused by the SDK encoder; U64 and Decimal carry it', async () => {
    const { surreal } = await seeded('sdk2_bigint');

    expect(await sdkError(() => sdk(surreal, 'CREATE t:6 SET u = $u;', { u: 18446744073709551615n }))).toBe(
      'The integer 18446744073709551615 is outside the signed 64-bit range of a SurrealDB int: send it as a Decimal, or as a U64 when it fits one',
    );
    await sdk(surreal, 'CREATE t:7 SET u = $u;', { u: new U64(18446744073709551615n) });
    await sdk(surreal, 'CREATE t:8 SET u = $u;', { u: new Decimal('18446744073709551615') });
    await sdk(surreal, 'CREATE t:9 SET u = $u;', { u: 9007199254740993n });

    const read = (await sdk(surreal, 'SELECT VALUE u FROM t:7, t:8, t:9;')) as U64[];
    expect(read.map((u) => u.value)).toEqual([18446744073709551615n, 18446744073709551615n, 9007199254740993n]);
  });

  test('a bigint param above 2^53 compares exactly against a u64 field', async () => {
    const { surreal } = await seeded('sdk2_where');
    await sdk(surreal, 'CREATE t:10 SET u = $u;', { u: 9007199254740993n });

    expect(String(await sdk(surreal, 'SELECT VALUE id FROM t WHERE u = $n;', { n: 9007199254740993n }))).toBe('t:10');
  });

  test('a U64 param above the signed range filters and compares a u64 field', async () => {
    const { surreal } = await seeded('sdk2_where_u64');
    const max = new U64(18446744073709551615n);

    expect(String(await sdk(surreal, 'SELECT VALUE id FROM t WHERE u = $n;', { n: max }))).toBe('t:1');
    expect(String(await sdk(surreal, 'SELECT VALUE id FROM t WHERE u < $n;', { n: max }))).toBe('t:2');
  });

  test('a bigint up to the i64 maximum is stored as u64, including exactly 2^53 (the number 2 ** 53 is what new U64 refuses)', async () => {
    const { db, surreal } = await seeded('sdk2_bigint_u64');
    const i64Max = 2n ** 63n - 1n;

    // The refusal is for the number 2 ** 53 (a double that cannot be told from 2 ** 53 + 1), not the bigint
    expect(await sdkError(async () => new U64(2 ** 53))).toContain('not an integer which u64 can hold exactly');
    await sdk(surreal, 'CREATE t:20 SET u = $u;', { u: new U64(2n ** 53n) });
    for (const [id, v] of [
      [21, 2n ** 53n],
      [22, 2n ** 53n + 1n],
      [23, 2n ** 54n],
      [24, i64Max],
      [25, 0n],
    ] as const)
      await sdk(surreal, `CREATE t:${id} SET u = $u;`, { u: v });

    expect(await sdk(surreal, 'SELECT VALUE type::of(u) FROM t:21, t:24, t:25;')).toEqual(['u64', 'u64', 'u64']);
    expect(await ok(db, 'SELECT VALUE u FROM t WHERE id >= t:21 AND id <= t:25 ORDER BY id;')).toEqual([
      2 ** 53,
      2 ** 53 + 1,
      2 ** 54,
      2 ** 63 - 1,
      0,
    ]);
  });

  test('SDK 2.2.1 drops a row holding a u64 of exactly 2^53 on read, while 2^53 - 1 and 2^53 + 1 read', async () => {
    const { surreal } = await seeded('sdk2_u64_2_53');
    await sdk(surreal, 'CREATE t:40 SET u = 9007199254740991u64; CREATE t:41 SET u = 9007199254740992u64;');
    await sdk(surreal, 'CREATE t:42 SET u = 9007199254740993u64; CREATE t:43 SET u = 9007199254740992;');
    const rows = async (id: number): Promise<number> =>
      ((await sdk(surreal, `SELECT * FROM t:${id}`)) as unknown[]).length;

    expect([await rows(40), await rows(41), await rows(42), await rows(43)]).toEqual([1, 0, 1, 0]);
    // A statement which must return one value names the lost one
    expect(await sdkError(() => sdk(surreal, 'RETURN 9007199254740992u64;'))).toContain('no value was sent');
  });

  test('the cause: the cbor.2 decoder reads the integer 2^53 as a number, and its u64 tag refuses that number', () => {
    // tag 186 (u64) holding the 8-byte integer 2^53; 2^53 + 1 is read as a bigint and decodes
    const tagged = (low: number) => new Uint8Array([0xd8, 186, 0x1b, 0, 0x20, 0, 0, 0, 0, 0, low]);

    expect(() => new CborCodec({ version: 2 }).decode(tagged(0))).toThrow(
      '9007199254740992 is not an integer which u64 can hold exactly',
    );
    expect((new CborCodec({ version: 2 }).decode(tagged(1)) as U64).value).toBe(2n ** 53n + 1n);
    expect((new CborCodec({ version: 2 }).decode(tagged(0xff)) as U64).value).toBe(2n ** 53n + 255n);
  });

  test('over HTTP the same read throws instead of dropping', async () => {
    const { db } = await seeded('sdk2_u64_2_53_http');
    const surreal = await connect(db, { http: true });

    expect(await sdkError(() => sdk(surreal, 'RETURN 9007199254740992u64;'))).toContain(
      '9007199254740992 is not an integer which u64 can hold exactly',
    );
  });

  test.each([false, true])(
    'the codecs Cerial connects with read a u64 of 2^53 as U64(2n ** 53n) (http: %p)',
    async (http) => {
      const { db } = await seeded(`cerial_u64_2_53_${http ? 'http' : 'ws'}`);
      const surreal = await connect(db, { cerial: true, http });
      await sdk(surreal, 'CREATE t:40 SET u = 9007199254740991u64; CREATE t:41 SET u = 9007199254740992u64;');
      await sdk(surreal, 'CREATE t:42 SET u = 9007199254740993u64; CREATE t:43 SET arr = [1], u = $u;', {
        u: 2n ** 53n,
      });
      const values = (await sdk(surreal, 'SELECT VALUE u FROM t WHERE id >= t:40 ORDER BY id;')) as U64[];

      expect(values.map((u) => [u instanceof U64, u.value])).toEqual([
        [true, 2n ** 53n - 1n],
        [true, 2n ** 53n],
        [true, 2n ** 53n + 1n],
        [true, 2n ** 53n],
      ]);
      expect(await sdk(surreal, 'RETURN [9007199254740992u64, { a: 9007199254740992u64 }, 9007199254740992];')).toEqual(
        [new U64(2n ** 53n), { a: new U64(2n ** 53n) }, 2 ** 53],
      );
    },
  );

  test('bigint params filter a u64 field by equality, range and IN, below and above 2^53', async () => {
    const { surreal } = await seeded('sdk2_bigint_where');
    for (const [id, v] of [
      [30, 2n ** 53n],
      [31, 2n ** 53n + 1n],
      [32, 2n ** 63n - 1n],
    ] as const)
      await sdk(surreal, `CREATE t:${id} SET u = $u;`, { u: v });
    const ids = async (where: string, vars: Record<string, unknown>): Promise<string[]> =>
      ((await sdk(surreal, `SELECT VALUE id FROM t WHERE u != NONE AND ${where} ORDER BY u;`, vars)) as unknown[])
        .map(String)
        .filter((id) => Number(id.slice(2)) >= 30);

    expect(await ids('u = $n', { n: 2n ** 53n })).toEqual(['t:30']);
    expect(await ids('u > $n', { n: 2n ** 53n })).toEqual(['t:31', 't:32']);
    expect(await ids('u < $n', { n: 2n ** 63n - 1n })).toEqual(['t:30', 't:31']);
    expect(await ids('u IN $n', { n: [2n ** 53n, 2n ** 63n - 1n] })).toEqual(['t:30', 't:32']);
    expect(await ids('u = $n', { n: 2n ** 53n + 1n })).toEqual(['t:31']);
  });

  test('the number param 0.1 does not find the f16 or f32 it was written into; the rounded value or an F32 / F16 instance does', async () => {
    const { surreal } = await seeded('sdk2_where_float');
    const where = async (field: string, value: unknown): Promise<string[]> =>
      ((await sdk(surreal, `SELECT VALUE id FROM t WHERE ${field} = $v;`, { v: value })) as unknown[]).map(String);

    expect(await where('f', 0.1)).toEqual([]);
    expect(await where('h', 0.1)).toEqual([]);
    expect(await where('f', Math.fround(0.1))).toEqual(['t:1']);
    expect(await where('h', 0.0999755859375)).toEqual(['t:1']);
    expect(await where('f', new F32(0.1))).toEqual(['t:1']);
    expect(await where('h', new F16(0.1))).toEqual(['t:1']);
  });
});

describe('SDK 2.2.1 forced to plain cbor, the pre-4.0 dialect', () => {
  test('sized kinds arrive as plain numbers, and u64 as number, bigint or Decimal by magnitude', async () => {
    const db = await scratch('sdk1_read');
    await ok(
      db,
      `DEFINE TABLE t SCHEMAFULL; DEFINE FIELD b ON t TYPE option<u8>; DEFINE FIELD h ON t TYPE option<f16>;
       DEFINE FIELD u ON t TYPE option<u64>;
       CREATE t:1 SET b = 7, h = 0.1, u = 3;
       CREATE t:2 SET u = 9007199254740993;
       CREATE t:3 SET u = 18446744073709551615u64;`,
    );
    const surreal = await connect(db, { dialect1: true });
    const one = (await sdk(surreal, 'SELECT * FROM ONLY t:1;')) as Record<string, unknown>;

    expect(one.b).toBe(7);
    expect(one.h).toBe(0.0999755859375);
    expect(one.u).toBe(3);
    expect(await sdk(surreal, 'SELECT VALUE u FROM ONLY t:2;')).toBe(9007199254740993n);
    expect(await sdk(surreal, 'SELECT VALUE u FROM ONLY t:3;')).toBeInstanceOf(Decimal);
  });
});
