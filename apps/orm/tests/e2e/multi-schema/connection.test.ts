import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { loadConfig, resolveConfig } from '../../../src/cli/config';
import { getFixturePath } from '../../fixtures/multi-schema/helpers';
import {
  clearTables,
  connectionFor,
  type GeneratedFixture,
  generateFixture,
  importClient,
  type RuntimeClient,
  type RuntimeClientClass,
  rawQuery,
} from './runtime-helpers';

const ALPHA_DB = 'ms_rt_alpha';

describe('per-schema connection config', () => {
  let fixture: GeneratedFixture;
  let alpha: RuntimeClient;
  let beta: RuntimeClient;
  let entries: ReturnType<typeof resolveConfig>;

  beforeAll(async () => {
    const fixtureDir = getFixturePath('runtime');
    const config = await loadConfig(join(fixtureDir, 'cerial.config.ts'));
    entries = resolveConfig(config!, fixtureDir);

    fixture = await generateFixture('runtime');
    await rawQuery(`DEFINE DATABASE IF NOT EXISTS ${ALPHA_DB};`);

    const AlphaClient = await importClient(fixture.outputs.alpha!, 'AlphaCerialClient');
    const BetaClient = await importClient(fixture.outputs.beta!, 'BetaCerialClient');
    alpha = new AlphaClient();
    beta = new BetaClient();
    await alpha.connect(entries.find((e) => e.name === 'alpha')!.connection!);
    await beta.connect(entries.find((e) => e.name === 'beta')!.connection!);
    await alpha.migrate();
    await beta.migrate();
    await clearTables(alpha, ['ms_rt_alpha_user', 'ms_rt_alpha_note']);
    await clearTables(beta, ['ms_rt_beta_account']);
  });

  afterAll(async () => {
    await alpha?.disconnect();
    await beta?.disconnect();
    await rawQuery(`REMOVE DATABASE IF EXISTS ${ALPHA_DB};`);
    await fixture?.cleanup();
  });

  it('resolves the schema override for one entry and the root default for the other', () => {
    expect(entries.find((e) => e.name === 'alpha')!.connection).toMatchObject({ database: ALPHA_DB });
    expect(entries.find((e) => e.name === 'beta')!.connection).toMatchObject({ database: 'main' });
  });

  it('embeds the entry connection in the generated client, without credentials', async () => {
    // connect() with no argument falls back to the connection resolved at generation, so the
    // target (url, namespace, database) is in the source. `auth` is deliberately not: the
    // generated directory may be committed, so credentials come from the environment instead.
    const alphaSource = await Bun.file(join(fixture.outputs.alpha!, 'client.ts')).text();
    const betaSource = await Bun.file(join(fixture.outputs.beta!, 'client.ts')).text();

    const embedded = (source: string) => /const EMBEDDED_CONNECTION[^;]*;/s.exec(source)![0];

    expect(alphaSource).toContain(ALPHA_DB);
    expect(betaSource).toContain("'main'");
    for (const block of [embedded(alphaSource), embedded(betaSource)]) {
      expect(block).not.toContain('auth');
      expect(block).not.toContain('password');
    }
  });

  describe('no-argument connect()', () => {
    const saved = { user: process.env.CERIAL_DB_USER, pass: process.env.CERIAL_DB_PASS };
    let AlphaClient: RuntimeClientClass;

    beforeAll(async () => {
      AlphaClient = await importClient(fixture.outputs.alpha!, 'AlphaCerialClient');
    });

    // Scoped to each case: the shared instance needs root/root and the embedded connection has no auth.
    beforeEach(() => {
      process.env.CERIAL_DB_USER = 'root';
      process.env.CERIAL_DB_PASS = 'root';
    });

    afterEach(() => {
      if (saved.user === undefined) delete process.env.CERIAL_DB_USER;
      else process.env.CERIAL_DB_USER = saved.user;
      if (saved.pass === undefined) delete process.env.CERIAL_DB_PASS;
      else process.env.CERIAL_DB_PASS = saved.pass;
    });

    it('routes a write to the embedded database', async () => {
      const client = new AlphaClient();
      await client.connect();
      try {
        await client.db.MsRtAlphaUser!.create({ data: { email: 'embedded@alpha.test', name: 'Emb' } });
      } finally {
        await client.disconnect();
      }

      const inAlphaDb = (await rawQuery(
        "SELECT * FROM ms_rt_alpha_user WHERE email = 'embedded@alpha.test';",
        ALPHA_DB,
      )) as [{ result: unknown[] }];
      const inMainDb = (await rawQuery(
        "SELECT * FROM ms_rt_alpha_user WHERE email = 'embedded@alpha.test';",
        'main',
      )) as [{ result: unknown[] }];

      await rawQuery('DELETE FROM ms_rt_alpha_user;', ALPHA_DB);

      expect(inAlphaDb[0].result).toHaveLength(1);
      // main has no such table, so the query errors rather than returning an empty list
      expect(Array.isArray(inMainDb[0].result) ? inMainDb[0].result : []).toHaveLength(0);
    });

    it('lets an explicit connection replace the embedded one', async () => {
      const client = new AlphaClient();
      await client.connect(connectionFor('main'));
      try {
        await client.db.MsRtAlphaUser!.create({ data: { email: 'explicit@alpha.test', name: 'Exp' } });
      } finally {
        await client.disconnect();
      }

      const sql = "SELECT * FROM ms_rt_alpha_user WHERE email = 'explicit@alpha.test';";
      const inMainDb = (await rawQuery(sql, 'main')) as [{ result: unknown[] }];
      const inAlphaDb = (await rawQuery(sql, ALPHA_DB)) as [{ result: unknown[] }];
      await rawQuery('DELETE FROM ms_rt_alpha_user;', 'main');

      expect(inMainDb[0].result).toHaveLength(1);
      expect(inAlphaDb[0].result).toHaveLength(0);
    });
  });

  it('lands each client rows in the database its resolved connection names', async () => {
    await alpha.db.MsRtAlphaUser!.create({ data: { email: 'a@alpha.test', name: 'Ada' } });
    await beta.db.MsRtBetaAccount!.create({ data: { handle: 'bee' } });

    const inAlphaDb = (await rawQuery('SELECT * FROM ms_rt_alpha_user;', ALPHA_DB)) as [{ result: unknown[] }];
    const inMainDb = (await rawQuery('SELECT * FROM ms_rt_beta_account;', 'main')) as [{ result: unknown[] }];

    expect(inAlphaDb[0].result).toEqual([expect.objectContaining({ email: 'a@alpha.test' })]);
    expect(inMainDb[0].result).toEqual([expect.objectContaining({ handle: 'bee' })]);
  });

  it('keeps the overridden database free of the other entry tables', async () => {
    const info = (await rawQuery('INFO FOR DB;', ALPHA_DB)) as [{ result: { tables: Record<string, string> } }];
    const defined = Object.keys(info[0].result.tables);

    expect(defined).toContain('ms_rt_alpha_user');
    expect(defined).not.toContain('ms_rt_beta_account');
  });
});
