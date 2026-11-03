/**
 * Runs the compile-time checks under `typechecks/` against the `.cerial` corpus generated with
 * `typeFiles: 'ts'`, the layout the default `.d.ts` run does not cover. The default layout is what
 * `typecheck` already checks against `generated/`.
 */

import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateSingleSchema } from '../../src/cli/generate';
import { typecheckAgainst } from './typecheck-overlay';

const E2E_DIR = resolve(import.meta.dir);
const OUTPUT_DIR = resolve(E2E_DIR, 'generated-layout-ts');

rmSync(OUTPUT_DIR, { recursive: true, force: true });
let exitCode = 1;
try {
  const result = await generateSingleSchema({
    schemaPath: resolve(E2E_DIR, 'schemas'),
    outputDir: OUTPUT_DIR,
    typeFiles: 'ts',
  });
  if (!result.success) throw new Error(`generate failed: ${result.errors.join('; ')}`);

  exitCode = await typecheckAgainst('typecheck:layout', 'typechecks-layout', 'generated-layout-ts');
} finally {
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
}

process.exit(exitCode);
