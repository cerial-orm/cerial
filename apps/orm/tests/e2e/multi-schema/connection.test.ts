import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { loadConfig, resolveConfig } from '../../../src/cli/config';
import { getFixturePath } from '../../fixtures/multi-schema/helpers';
import {
  clearTables,
  type GeneratedFixture,
  generateFixture,
  importClient,
  type RuntimeClient,
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

  it('does not embed the configured connection in the generated client', async () => {
    // connect() takes the connection explicitly; the config value only reaches the caller
    // through resolveConfig, so the generated source must stay free of it.
    const source = await Bun.file(join(fixture.outputs.alpha!, 'client.ts')).text();

    expect(source).not.toContain(ALPHA_DB);
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
