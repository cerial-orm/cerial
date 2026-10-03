/**
 * Hostile schema values must produce generated output that parses
 *
 * Each value is run through the real generator. The TypeScript files are parsed
 * and the registry is imported to prove the value survives the round trip; the
 * DDL is run against the shared SurrealDB instance on a throwaway table when one
 * is reachable.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateSingleSchema } from '../../src/cli/generate';
import { generateRegistryDefineStatements } from '../../src/generators/migrations/define-generator';
import { parseModelRegistry } from '../test-helpers';

const SURREAL_SQL_URL = 'http://127.0.0.1:8000/sql';
const PROBE = 'SbxEscapeProbe';
const PROBE_TABLE = 'sbx_escape_probe';
const SANDBOX_TABLE = 'sbx_escaping';
const SANDBOX_VICTIM = 'sbx_escaping_victim';

/** Schema-side text for each hostile value and the string the generated client must hold. */
const HOSTILE = [
  { label: 'apostrophe', schema: "O'Brien", value: "O'Brien" },
  { label: 'backslash', schema: 'a\\b', value: 'a\\b' },
  { label: 'trailing backslash', schema: 'x\\', value: 'x\\' },
  { label: 'newline escape text', schema: 'l1\\nl2', value: 'l1\\nl2' },
  { label: 'semicolon', schema: "a; DEFINE TABLE evil; --'", value: "a; DEFINE TABLE evil; --'" },
  { label: 'code breakout', schema: "x'; globalThis.pwned = 1; '", value: "x'; globalThis.pwned = 1; '" },
  { label: 'comment terminator', schema: '*/ x /*', value: '*/ x /*' },
];

const quotedSurql = (v: string) => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const fieldName = (i: number) => `f${i}`;

/** A string value goes in double quotes in the schema so an apostrophe needs no help from the parser. */
const quoted = (schema: string) => (schema.includes('"') ? `'${schema}'` : `"${schema}"`);

const buildSchema = () => {
  const defaults = HOSTILE.map((h, i) => `  ${fieldName(i)} String @default(${quoted(h.schema)})`).join('\n');
  const variants = HOSTILE.map((h) => quoted(h.schema)).join(', ');

  return `literal Hostile { ${variants} }

model ${PROBE} {
  id Record @id
${defaults}
  always String @defaultAlways(${quoted(HOSTILE[0]!.schema)})
  pick Hostile
}
`;
};

/** Parse before importing: Bun can crash the whole run on a file with an unterminated string. */
const importGenerated = async (file: string) => {
  new Bun.Transpiler({ loader: 'ts' }).transformSync(await Bun.file(file).text());

  return import(file);
};

let workDir: string;
let outDir: string;
let generatedFiles: string[] = [];

const dbReachable = await fetch(SURREAL_SQL_URL, {
  method: 'POST',
  headers: {
    Accept: 'application/json',
    'surreal-ns': 'main',
    'surreal-db': 'main',
    Authorization: `Basic ${btoa('root:root')}`,
  },
  body: 'RETURN 1;',
})
  .then((r) => r.ok)
  .catch(() => false);

const runSql = async (sql: string) => {
  const res = await fetch(SURREAL_SQL_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'surreal-ns': 'main',
      'surreal-db': 'main',
      Authorization: `Basic ${btoa('root:root')}`,
    },
    body: sql,
  });

  return (await res.json()) as { status: string; result: unknown }[] | { code: number; information: string };
};

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'cerial-escaping-'));
  outDir = join(workDir, 'out');
  const schemaPath = join(workDir, 'schema.cerial');
  await writeFile(schemaPath, buildSchema());

  const result = await generateSingleSchema({ schemaPath, outputDir: outDir, logLevel: 'minimal' });
  expect(result.errors).toEqual([]);
  expect(result.success).toBe(true);
  generatedFiles = result.files;
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
  if (dbReachable) {
    await runSql(
      `REMOVE TABLE IF EXISTS ${PROBE_TABLE}; REMOVE TABLE IF EXISTS ${SANDBOX_TABLE}; REMOVE TABLE IF EXISTS ${SANDBOX_VICTIM};`,
    );
  }
});

describe('generated TypeScript parses', () => {
  test('every emitted file is valid TypeScript', async () => {
    const transpiler = new Bun.Transpiler({ loader: 'ts' });
    expect(generatedFiles.length).toBeGreaterThan(0);

    for (const file of generatedFiles) {
      const source = await Bun.file(file).text();
      expect(() => transpiler.transformSync(source), file).not.toThrow();
    }
  });

  test('the registry holds each hostile default byte for byte', async () => {
    const { modelRegistry } = await importGenerated(join(outDir, 'internal', 'model-registry.ts'));
    const fields = new Map<string, { defaultValue?: unknown }>(
      (modelRegistry[PROBE].fields as { name: string; defaultValue?: unknown }[]).map((f) => [f.name, f]),
    );

    HOSTILE.forEach((h, i) => {
      expect(fields.get(fieldName(i))?.defaultValue, h.label).toBe(h.value);
    });
    expect((fields.get('always') as { defaultAlwaysValue?: unknown }).defaultAlwaysValue).toBe(HOSTILE[0]!.value);
  });

  test('the registry holds each hostile literal variant byte for byte', async () => {
    const { modelRegistry } = await importGenerated(join(outDir, 'internal', 'model-registry.ts'));
    const pick = (
      modelRegistry[PROBE].fields as { name: string; literalInfo?: { variants: { value: string }[] } }[]
    ).find((f) => f.name === 'pick');

    expect(pick?.literalInfo?.variants.map((v) => v.value)).toEqual(HOSTILE.map((h) => h.value));
  });

  test('the emitted migration statements equal the statements generated in memory', async () => {
    const mod = await importGenerated(join(outDir, 'internal', 'migrations.ts'));

    expect(mod.migrationsByModel[PROBE].join('\n')).toContain("DEFAULT 'O\\'Brien'");
    expect(mod.getModelMigrationQuery(PROBE)).toBe(mod.migrationsByModel[PROBE].join('\n'));
  });

  test('the literal type file lists every hostile variant', async () => {
    const files = await readdir(join(outDir, 'literals'));
    const source = await Bun.file(join(outDir, 'literals', files[0]!)).text();

    // Biome picks the quote style that needs the fewest escapes, so both forms are valid here
    expect(source).toContain('"O\'Brien"');
    expect(source).toContain("'x\\\\'");
  });
});

describe('generated DDL', () => {
  const ddlFor = (dsl: string) => generateRegistryDefineStatements(parseModelRegistry(dsl));

  test('escapes an apostrophe, a trailing backslash and a semicolon in DEFAULT', () => {
    const ddl = ddlFor(`model ${SANDBOX_TABLE} {
  id Record @id
  a String @default("O'Brien")
  b String @default("x\\")
  c String @default("a; REMOVE TABLE ${SANDBOX_VICTIM}")
}`).join('\n');

    expect(ddl).toContain("DEFAULT 'O\\'Brien'");
    expect(ddl).toContain("DEFAULT 'x\\\\'");
    expect(ddl).toContain(`DEFAULT 'a; REMOVE TABLE ${SANDBOX_VICTIM}'`);
  });

  test('quotes a duration-prefixed default that is not a duration, so it cannot carry a second statement', () => {
    const ddl = ddlFor(`model ${SANDBOX_TABLE} {
  id Record @id
  c String @default("1h; REMOVE TABLE ${SANDBOX_VICTIM}")
}`).join('\n');

    expect(ddl).toContain(`DEFAULT '1h; REMOVE TABLE ${SANDBOX_VICTIM}'`);
  });

  test('still emits real durations unquoted', () => {
    const ddl = ddlFor(`model ${SANDBOX_TABLE} {
  id Record @id
  a Duration @default(1h30m)
  b Duration @default(500ms)
}`).join('\n');

    expect(ddl).toContain('DEFAULT 1h30m');
    expect(ddl).toContain('DEFAULT 500ms');
  });

  test.skipIf(!dbReachable)(
    'the instance accepts the generated migration and the victim table survives',
    async () => {
      const mod = await importGenerated(join(outDir, 'internal', 'migrations.ts'));
      const statements: string[] = mod.migrationsByModel[PROBE];
      await runSql(`DEFINE TABLE ${SANDBOX_VICTIM} SCHEMALESS;`);

      const results = (await runSql(statements.join('\n'))) as { status: string }[];
      expect(Array.isArray(results), JSON.stringify(results)).toBe(true);
      expect(results.every((r) => r.status === 'OK')).toBe(true);

      const created = (await runSql(
        `CREATE ${PROBE_TABLE}:one SET pick = $p;`.replace('$p', quotedSurql(HOSTILE[0]!.value)),
      )) as {
        result: Record<string, unknown>[];
      }[];
      const row = created[0]!.result[0]!;
      HOSTILE.forEach((h, i) => {
        expect(row[fieldName(i)], h.label).toBe(h.value);
      });
      expect(row.pick).toBe(HOSTILE[0]!.value);
      expect(JSON.stringify(await runSql('INFO FOR DB;'))).toContain(SANDBOX_VICTIM);

      await runSql(`REMOVE TABLE ${PROBE_TABLE};`);
    },
    30_000,
  );

  test.skipIf(!dbReachable)(
    'a duration-prefixed default does not run a second statement',
    async () => {
      await runSql(`DEFINE TABLE ${SANDBOX_VICTIM} SCHEMALESS;`);
      const sql = ddlFor(`model ${SANDBOX_TABLE} {
  id Record @id
  c String @default("1h; REMOVE TABLE ${SANDBOX_VICTIM}")
}`).join('\n');

      await runSql(sql);

      expect(JSON.stringify(await runSql('INFO FOR DB;'))).toContain(SANDBOX_VICTIM);
    },
    30_000,
  );
});
