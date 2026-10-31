/**
 * Bun test preload for the e2e suite against the client generated from the TypeScript corpus.
 *
 * The test files import `tests/e2e/generated` by path. Mocking redirects those modules to
 * `generated-ts`, so `generated` (the `.cerial` client) is never read or rewritten by this run and
 * stays correct for a following `test:e2e`. The global-setup contract is the same as `preload.ts`:
 * generate once, then `globalCleanup()` once before any test file.
 */

import { mock } from 'bun:test';
import { rmSync, renameSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { generate } from '../../src/cli/generate';

const E2E_DIR = resolve(import.meta.dir);
const SCHEMA_DIR = resolve(E2E_DIR, 'schemas-ts');
const OUTPUT_DIR = resolve(E2E_DIR, 'generated-ts');
const REDIRECTED_DIR = resolve(E2E_DIR, 'generated');

if (process.env.BUN_TEST_WORKER_ID) throw new Error('The TypeScript e2e run is sequential only');

// Generate beside the live directory and swap it in, so a reader never sees it half-written
const nextDir = resolve(E2E_DIR, `.generated-ts-next-${process.pid}`);
const previousDir = resolve(E2E_DIR, `.generated-ts-prev-${process.pid}`);
rmSync(nextDir, { recursive: true, force: true });

try {
  console.log('[E2E TS Setup] Generating test client from the TypeScript corpus...');
  const result = await generate({ schema: SCHEMA_DIR, output: nextDir, verbose: false });
  if (!result.success) throw new Error(`Failed to generate client: ${result.errors.join(', ')}`);

  if (existsSync(OUTPUT_DIR)) renameSync(OUTPUT_DIR, previousDir);
  renameSync(nextDir, OUTPUT_DIR);
  console.log(`[E2E TS Setup] Generated ${result.files.length} files`);
} finally {
  rmSync(nextDir, { recursive: true, force: true });
  rmSync(previousDir, { recursive: true, force: true });
}

// Resolver plugins do not see relative imports between TypeScript sources, so each module of the
// `.cerial` client is mocked with the module at the same path in the TypeScript client
for (const file of new Bun.Glob('**/*.ts').scanSync(OUTPUT_DIR)) {
  const replacement = await import(resolve(OUTPUT_DIR, file));
  mock.module(resolve(REDIRECTED_DIR, file), () => replacement);
}

// Imported after the plugin is registered, so the helper loads the TypeScript client
const { CerialClient, testConfig, globalCleanup } = await import('./test-helper');
if (!/^[A-Za-z0-9_]+$/.test(testConfig.database)) {
  throw new Error(`Invalid e2e database name: ${testConfig.database}`);
}

console.log(`[E2E TS Setup] Running global database cleanup and migration on ${testConfig.database}...`);
const client = new CerialClient();
await client.connect(testConfig);
await globalCleanup(client);
await client.disconnect();
console.log(`[E2E TS Setup] Database ${testConfig.database} ready`);
