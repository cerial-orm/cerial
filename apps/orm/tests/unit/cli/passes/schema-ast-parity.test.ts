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
  relations: 'b365ace75a04daf42b3579832f6ad3d6e080bbf0f1c61f44391f85329e7bdc2d',
  decorators: 'c6ac3ea36e306d38e170e3565599cc7ecd5c4f905618f90f71deeb696c5edf26',
  'data-types': '42a65dc830a2f86c046973d9b13b73bc4a3ea38899896ebab7c6564b1fdacbfd',
  features: 'acdb12bb0efb288a08f84bd268fa0c29b6c3fc166425618f3427e61888b4a076',
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
