import { describe, expect, test } from 'bun:test';
import { fingerprint, liveFingerprint, schemaFingerprint } from '../../../src/migrations';
import type { TableModel } from '../../../src/migrations';
import { field, index, schema, table } from './diff-helpers';

function base(): TableModel {
  return table(
    'user',
    [
      field('name', 'string', { assert: '$value != NONE', default: "'x'" }),
      field('address.city', 'option<string>'),
      field('tags', 'array<string>'),
    ],
    [index('user_email', 'email', 'UNIQUE'), index('user_name', 'name')],
  );
}

describe('fingerprint: stability', () => {
  test('is a 64-character hex SHA-256 and a fixed value for a fixed model', () => {
    const hash = fingerprint(table('t', [field('a', 'int')]));

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(fingerprint(table('t', [field('a', 'int')])));
  });

  test('ignores key order, field order and index order', () => {
    const shuffled: TableModel = {
      indexes: [...base().indexes].reverse(),
      fields: [...base().fields].reverse().map((f) => Object.fromEntries(Object.entries(f).reverse()) as typeof f),
      name: 'user',
    };

    expect(fingerprint(shuffled)).toBe(fingerprint(base()));
  });

  test('is the same in a second process', async () => {
    const model = JSON.stringify(base());
    const script = `import { fingerprint } from ${JSON.stringify(new URL('../../../src/migrations/fingerprint.ts', import.meta.url).pathname)};
console.log(fingerprint(JSON.parse(process.argv[1])));`;
    const proc = Bun.spawn(['bun', '-e', script, model], { stdout: 'pipe' });
    const out = (await new Response(proc.stdout).text()).trim();

    expect(await proc.exited).toBe(0);
    expect(out).toBe(fingerprint(base()));
  });
});

describe('fingerprint: sensitivity', () => {
  const change = (patch: Partial<ReturnType<typeof base>['fields'][number]>): string => {
    const model = base();
    const fields = model.fields.map((f, i) => (i === 0 ? { ...f, ...patch } : f));

    return fingerprint({ ...model, fields });
  };

  test.each([
    ['kind', { kind: 'int' }],
    ['default', { default: "'y'" }],
    ['defaultAlways', { defaultAlways: true as const }],
    ['value', { value: 'time::now()' }],
    ['computed', { computed: 'time::now()' }],
    ['assert', { assert: '$value != 1' }],
    ['readonly', { readonly: true as const }],
    ['flexible', { flexible: true as const }],
    ['path', { path: ['other'] }],
  ])('a changed field %s changes it', (_name, patch) => {
    expect(change(patch)).not.toBe(fingerprint(base()));
  });

  test('a removed field and a removed index change it', () => {
    const model = base();

    expect(fingerprint({ ...model, fields: model.fields.slice(1) })).not.toBe(fingerprint(model));
    expect(fingerprint({ ...model, indexes: model.indexes.slice(1) })).not.toBe(fingerprint(model));
  });

  test.each([
    ['name', { name: 'renamed' }],
    ['columns', { columns: [['other']] }],
    ['index clause', { index: 'UNIQUE' }],
  ])('a changed index %s changes it', (_name, patch) => {
    const model = base();
    const indexes = model.indexes.map((i, n) => (n === 1 ? { ...i, ...patch } : i));

    expect(fingerprint({ ...model, indexes })).not.toBe(fingerprint(model));
  });

  test('column order within a composite index changes it', () => {
    const ab = table('t', [], [{ name: 'i', columns: [['a'], ['b']], index: '' }]);
    const ba = table('t', [], [{ name: 'i', columns: [['b'], ['a']], index: '' }]);

    expect(fingerprint(ab)).not.toBe(fingerprint(ba));
  });

  test('a table rename changes it', () => {
    expect(fingerprint({ ...base(), name: 'account' })).not.toBe(fingerprint(base()));
  });
});

describe('fingerprint: cosmetics', () => {
  test('option<T> against none | T, and a float literal suffix, do not change it', () => {
    const a = table('t', [field('a', 'option<string>', { default: '99.99' })]);
    const b = table('t', [field('a', 'none | string', { default: '99.99f' })]);

    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  test('raw model text is canonicalised too, not only builder output', () => {
    const raw: TableModel = { name: 't', fields: [{ path: ['a'], kind: 'option<string>' }], indexes: [] };

    expect(fingerprint(raw)).toBe(fingerprint(table('t', [field('a', 'none | string')])));
  });
});

describe('schemaFingerprint and liveFingerprint', () => {
  const tables = [base(), table('post', [field('title', 'string')])];

  test('ignores table order and unmanaged entries', () => {
    const withUnmanaged = schema([...tables].reverse(), [{ kind: 'event', name: 'e', table: 'user' }]);

    expect(schemaFingerprint(withUnmanaged)).toBe(schemaFingerprint(schema(tables)));
  });

  test('changes with any table change, an added table or a rename', () => {
    const original = schemaFingerprint(schema(tables));

    expect(schemaFingerprint(schema([tables[0]!]))).not.toBe(original);
    expect(schemaFingerprint(schema([{ ...tables[0]!, name: 'u2' }, tables[1]!]))).not.toBe(original);
    expect(
      schemaFingerprint(schema([tables[0]!, table('post', [field('title', 'string'), field('extra', 'int')])])),
    ).not.toBe(original);
  });

  test('a desired-side and a reader-side model of one schema hash equal; a hand-added field does not', () => {
    // The reader hands back fields in server order with the server's rendering of the same types.
    const desired = schema([table('t', [field('a', 'option<string>'), field('b', 'float', { default: '0.5' })])]);
    const live = schema([table('t', [field('b', 'float', { default: '0.5f' }), field('a', 'none | string')])]);

    expect(liveFingerprint(live)).toBe(schemaFingerprint(desired));
    const handAdded = schema([table('t', [...live.tables[0]!.fields, field('extra', 'any')])]);
    expect(liveFingerprint(handAdded)).not.toBe(schemaFingerprint(desired));
  });
});

describe('fingerprint: module graph', () => {
  test('imports only node:crypto, so the runtime entry never reaches the CLI', async () => {
    const entry = new URL('../../../src/migrations/fingerprint.ts', import.meta.url).pathname;
    const result = await Bun.build({ entrypoints: [entry], packages: 'external', target: 'node' });
    expect(result.success).toBe(true);
    const code = await result.outputs[0]!.text();
    const specifiers = [...code.matchAll(/(?:from|import)\s*\(?\s*["']([^"'./][^"']*)["']/g)].map((m) => m[1]!);

    expect(new Set(specifiers)).toEqual(new Set(['node:crypto']));
    expect(code).not.toContain('oxfmt');
  });
});

describe('fingerprint: table mode', () => {
  test('moves when the table is not the ordinary schemafull one', () => {
    expect(fingerprint({ ...base(), mode: 'ANY SCHEMALESS' })).not.toBe(fingerprint(base()));
  });

  test('near miss: an absent mode hashes as it did before the field existed', () => {
    expect(fingerprint({ ...base(), mode: undefined })).toBe(fingerprint(base()));
  });
});
