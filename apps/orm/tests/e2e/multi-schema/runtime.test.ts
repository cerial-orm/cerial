import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { tables } from '../test-helper';
import {
  clearTables,
  connectionFor,
  type GeneratedFixture,
  generateFixture,
  importClient,
  type RuntimeClient,
} from './runtime-helpers';

const ALPHA_TABLES = ['ms_rt_alpha_user', 'ms_rt_alpha_note'];
const BETA_TABLES = ['ms_rt_beta_account'];

describe('two generated clients on one database', () => {
  let fixture: GeneratedFixture;
  let alpha: RuntimeClient;
  let beta: RuntimeClient;

  beforeAll(async () => {
    fixture = await generateFixture('runtime');
    expect(fixture.result.success).toBe(true);

    const AlphaClient = await importClient(fixture.outputs.alpha!, 'AlphaCerialClient');
    const BetaClient = await importClient(fixture.outputs.beta!, 'BetaCerialClient');
    alpha = new AlphaClient();
    beta = new BetaClient();
    await alpha.connect(connectionFor('main'));
    await beta.connect(connectionFor('main'));
    await clearTables(alpha, [...ALPHA_TABLES, ...BETA_TABLES]);
  });

  afterAll(async () => {
    if (alpha) await clearTables(alpha, [...ALPHA_TABLES, ...BETA_TABLES]);
    await alpha?.disconnect();
    await beta?.disconnect();
    await fixture?.cleanup();
  });

  it('registers every fixture table in the shared registry', () => {
    for (const table of [...ALPHA_TABLES, ...BETA_TABLES, 'ms_rt_shared']) {
      expect(tables.multiSchemaRuntime).toContain(table);
    }
  });

  it('exposes only its own models on each client', () => {
    expect(Object.keys(alpha.db).sort()).toEqual(['MsRtAlphaNote', 'MsRtAlphaUser']);
    expect(Object.keys(beta.db)).toEqual(['MsRtBetaAccount']);
  });

  describe('migrating the second client after the first has written rows', () => {
    beforeEach(async () => {
      alpha.resetMigrationState();
      beta.resetMigrationState();
      await clearTables(alpha, [...ALPHA_TABLES, ...BETA_TABLES]);
    });

    it('creates and reads through the first client after migrating only it', async () => {
      await alpha.migrate();
      expect(alpha.isMigrated).toBe(true);
      expect(beta.isMigrated).toBe(false);

      const user = await alpha.db.MsRtAlphaUser!.create({
        data: { email: 'a@alpha.test', name: 'Ada', tags: ['x'] },
      });
      const note = await alpha.db.MsRtAlphaNote!.create({ data: { body: 'hello', authorId: user.id } });

      expect(await alpha.db.MsRtAlphaUser!.findOne({ where: { email: 'a@alpha.test' } })).toMatchObject({
        name: 'Ada',
        tags: ['x'],
      });
      expect(await alpha.db.MsRtAlphaNote!.findOne({ where: { id: note.id } })).toMatchObject({ body: 'hello' });
    });

    it('keeps the first client rows readable after the second client migrates', async () => {
      await alpha.migrate();
      const user = await alpha.db.MsRtAlphaUser!.create({ data: { email: 'a@alpha.test', name: 'Ada' } });
      await alpha.db.MsRtAlphaNote!.create({ data: { body: 'before beta', authorId: user.id } });

      await beta.migrate();

      expect(await alpha.db.MsRtAlphaUser!.count()).toBe(1);
      expect(await alpha.db.MsRtAlphaUser!.findMany()).toEqual([expect.objectContaining({ email: 'a@alpha.test' })]);
      expect(await alpha.db.MsRtAlphaNote!.findMany()).toEqual([expect.objectContaining({ body: 'before beta' })]);
    });

    it('still enforces the first client schema after the second client migrates', async () => {
      await alpha.migrate();
      await beta.migrate();

      await alpha.db.MsRtAlphaUser!.create({ data: { email: 'dup@alpha.test', name: 'One' } });

      await expect(
        (async () => {
          await alpha.db.MsRtAlphaUser!.create({ data: { email: 'dup@alpha.test', name: 'Two' } });
        })(),
      ).rejects.toThrow();
      expect(await alpha.db.MsRtAlphaUser!.count()).toBe(1);
    });

    it('lets both migrations define their tables side by side', async () => {
      await alpha.migrate();
      await beta.migrate();

      const info = (await alpha.getSurreal()?.query('INFO FOR DB;')) as [{ tables: Record<string, string> }];
      const defined = Object.keys(info[0].tables);

      for (const table of [...ALPHA_TABLES, ...BETA_TABLES]) expect(defined).toContain(table);
    });
  });

  describe('isolation of the tables each client owns', () => {
    beforeEach(async () => {
      await alpha.migrate();
      await beta.migrate();
      await clearTables(alpha, [...ALPHA_TABLES, ...BETA_TABLES]);
    });

    it('writes through the second client without touching the first client tables', async () => {
      await alpha.db.MsRtAlphaUser!.create({ data: { email: 'a@alpha.test', name: 'Ada' } });
      await beta.db.MsRtBetaAccount!.create({ data: { handle: 'bee', balance: 5 } });
      await beta.db.MsRtBetaAccount!.create({ data: { handle: 'wasp' } });

      expect(await alpha.db.MsRtAlphaUser!.count()).toBe(1);
      expect(await alpha.db.MsRtAlphaNote!.count()).toBe(0);
      expect(await beta.db.MsRtBetaAccount!.count()).toBe(2);
      expect(await beta.db.MsRtBetaAccount!.findOne({ where: { handle: 'wasp' } })).toMatchObject({ balance: 0 });
    });

    it('does not let a delete through one client remove the other client rows', async () => {
      await alpha.db.MsRtAlphaUser!.create({ data: { email: 'a@alpha.test', name: 'Ada' } });
      await beta.db.MsRtBetaAccount!.create({ data: { handle: 'bee' } });

      expect(await beta.db.MsRtBetaAccount!.deleteMany({ where: { handle: 'bee' } })).toBe(1);

      expect(await beta.db.MsRtBetaAccount!.count()).toBe(0);
      expect(await alpha.db.MsRtAlphaUser!.count()).toBe(1);
    });

    it('keeps the second client rows when the first client re-runs its migration', async () => {
      await beta.db.MsRtBetaAccount!.create({ data: { handle: 'bee', balance: 9 } });
      await alpha.db.MsRtAlphaUser!.create({ data: { email: 'a@alpha.test', name: 'Ada' } });

      alpha.resetMigrationState();
      await alpha.migrate();

      expect(await beta.db.MsRtBetaAccount!.findMany()).toEqual([
        expect.objectContaining({ handle: 'bee', balance: 9 }),
      ]);
      expect(await alpha.db.MsRtAlphaUser!.count()).toBe(1);
    });

    it('stores each client rows in its own table, visible to raw queries', async () => {
      await alpha.db.MsRtAlphaUser!.create({ data: { email: 'a@alpha.test', name: 'Ada' } });
      await beta.db.MsRtBetaAccount!.create({ data: { handle: 'bee' } });

      const surreal = alpha.getSurreal();
      if (!surreal) throw new Error('alpha client has no live connection');
      const [alphaRows, betaRows] = (await surreal.query(
        'SELECT count() FROM ms_rt_alpha_user GROUP ALL; SELECT count() FROM ms_rt_beta_account GROUP ALL;',
      )) as [{ count: number }[], { count: number }[]];

      expect(alphaRows).toEqual([{ count: 1 }]);
      expect(betaRows).toEqual([{ count: 1 }]);
    });
  });
});
