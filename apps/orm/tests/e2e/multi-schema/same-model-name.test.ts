import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { loadConfig } from '../../../src/cli/config';
import { getFixturePath } from '../../fixtures/multi-schema/helpers';
import {
  clearTables,
  connectionFor,
  type GeneratedFixture,
  generateFixture,
  importClient,
  type RuntimeClient,
} from './runtime-helpers';

const TABLES = ['ms_rt_shared'];

describe('two schema entries declaring the same model name', () => {
  let fixture: GeneratedFixture;
  let one: RuntimeClient;
  let two: RuntimeClient;

  beforeAll(async () => {
    fixture = await generateFixture('same-name');
    const OneClient = await importClient(fixture.outputs.one!, 'OneCerialClient');
    const TwoClient = await importClient(fixture.outputs.two!, 'TwoCerialClient');
    one = new OneClient();
    two = new TwoClient();
    await one.connect(connectionFor('main'));
    await two.connect(connectionFor('main'));
    await clearTables(one, TABLES);
  });

  afterAll(async () => {
    if (one) await clearTables(one, TABLES);
    await one?.disconnect();
    await two?.disconnect();
    await fixture?.cleanup();
  });

  it('generates both entries without complaint', () => {
    expect(fixture.result.success).toBe(true);
    expect(fixture.result.errors).toEqual([]);
  });

  it('maps both entries to the same table', async () => {
    for (const dir of Object.values(fixture.outputs)) {
      const registry = await Bun.file(`${dir}/internal/model-registry.ts`).text();
      expect(registry).toContain("'ms_rt_shared'");
    }
  });

  describe('sharing the table', () => {
    beforeEach(async () => {
      one.resetMigrationState();
      two.resetMigrationState();
      await clearTables(one, TABLES);
    });

    it('serves the first client while only its migration has run', async () => {
      await one.migrate();

      await one.db.MsRtShared!.create({ data: { label: 'from one' } });

      expect(await one.db.MsRtShared!.findMany()).toEqual([expect.objectContaining({ label: 'from one' })]);
    });

    it('lets the later migration redefine the table, keeping existing rows', async () => {
      await one.migrate();
      await one.db.MsRtShared!.create({ data: { label: 'written by one' } });

      await two.migrate();

      expect(await two.db.MsRtShared!.findMany()).toEqual([expect.objectContaining({ label: 'written by one' })]);
      const info = (await one.getSurreal()?.query('INFO FOR TABLE ms_rt_shared;')) as [
        { fields: Record<string, string> },
      ];
      expect(Object.keys(info[0].fields).sort()).toEqual(['extra', 'label']);
    });

    it('rejects a first-client write once the second migration has made extra required', async () => {
      await one.migrate();
      await two.migrate();

      await expect(
        (async () => {
          await one.db.MsRtShared!.create({ data: { label: 'late from one' } });
        })(),
      ).rejects.toThrow(/extra.*ms_rt_shared|ms_rt_shared.*extra/s);
      expect(await two.db.MsRtShared!.count()).toBe(0);
    });

    it('accepts the full shape through the second client and exposes it to the first', async () => {
      await one.migrate();
      await two.migrate();

      await two.db.MsRtShared!.create({ data: { label: 'from two', extra: 7 } });

      expect(await one.db.MsRtShared!.findMany()).toEqual([expect.objectContaining({ label: 'from two', extra: 7 })]);
    });
  });
});

describe('overlapping schema paths in one config', () => {
  it('refuses the config and names both paths', async () => {
    const dir = getFixturePath('overlapping');

    await expect(loadConfig(`${dir}/cerial.config.ts`)).rejects.toThrow(
      /Schema paths overlap: "\.\/schemas\/auth" and "\.\/schemas"/,
    );
  });
});
