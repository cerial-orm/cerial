import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildResolvedSchemaAst } from '../../../../src/cli/resolvers';

const SCHEMAS = resolve(import.meta.dir, '../../../e2e/schemas');

/**
 * Digest of `combinedAST` and the errors per schema folder, captured from the pipeline before it was split
 * into passes. A change to what any e2e schema parses to changes its digest.
 */
const BEFORE_PASSES: Record<string, string> = {
  core: '1593838e48a2e4386f7791e6bb1226ce19daeecef8dfbb8a0fe222f7f38c479f',
  relations: '57caa4387a7a291140f586d21b375ed192c8063885dd5bd370b64368ac345f32',
  decorators: '0e5c57b5c60269f52a7eb55cded0f14aa3391f73dc6f77c0b968ac2de30d168b',
  'data-types': 'f635364d907151923e6f89a232867131985dbfae36575391e10ff9cf806676df',
  features: 'c96ebef4b7611e0124bbc7dfdd8f9f9cbe6e66986a6b1b63650a1f0bf18d1862',
  'complex-types': '6ff1d4b21160c5c21af187d96964cc997004390580fd43246c3f16bffbd09e9d',
};

async function digest(folder: string): Promise<string> {
  const built = await buildResolvedSchemaAst({ schemaPath: join(SCHEMAS, folder) });
  const json = JSON.stringify({ c: built.combinedAST, p: built.parseErrors, e: built.extendsErrors });

  return createHash('sha256').update(json.split(SCHEMAS).join('<schemas>')).digest('hex');
}

describe('buildResolvedSchemaAst over the e2e schemas', () => {
  it('covers every schema folder', () => {
    expect(readdirSync(SCHEMAS).sort()).toEqual(Object.keys(BEFORE_PASSES).sort());
  });

  for (const [folder, expected] of Object.entries(BEFORE_PASSES)) {
    it(`yields the combinedAST it yielded before the passes: ${folder}`, async () => {
      expect(await digest(folder)).toBe(expected);
    });
  }
});
