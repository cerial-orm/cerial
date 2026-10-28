/**
 * E2E Test Setup
 *
 * This file generates the test client before running e2e tests.
 * It simulates the real user experience of:
 * 1. Defining a schema
 * 2. Running the generate command
 * 3. Using the generated client
 */

import { existsSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { generate } from '../../src/cli/generate';
import { isParallelWorker, resolveRunDir, runOnce } from './run-guard';

const E2E_DIR = resolve(import.meta.dir);
const SCHEMA_DIR = resolve(E2E_DIR, 'schemas');
const OUTPUT_DIR = resolve(E2E_DIR, 'generated');

/**
 * Setup function - generates the test client and prepares the database.
 * Under `--parallel` the preload runs once per test file in every worker, so generation is guarded
 * to run once per run and migration once per worker database; sequentially both run directly.
 */
export async function setup(): Promise<void> {
  if (!isParallelWorker()) {
    await generateClient();
    await prepareDatabase();

    return;
  }

  const runDir = resolveRunDir(SCHEMA_DIR);
  const generated = await runOnce('generate', generateClient, runDir);
  if (!generated) console.log('[E2E Setup] Test client prepared by another worker');

  // Keyed by database name: files landing on the same worker share one database, so migrate once
  const { testConfig } = await import('./test-helper');
  await runOnce(`database-${testConfig.database}`, prepareDatabase, runDir);
}

async function generateClient(): Promise<void> {
  console.log('[E2E Setup] Generating test client...');

  // Generate beside the live directory and swap it in, so a reader never sees it half-written
  const nextDir = resolve(E2E_DIR, `.generated-next-${process.pid}`);
  const previousDir = resolve(E2E_DIR, `.generated-prev-${process.pid}`);
  rmSync(nextDir, { recursive: true, force: true });

  try {
    const result = await generate({
      schema: SCHEMA_DIR,
      output: nextDir,
      verbose: false,
    });

    if (!result.success) {
      throw new Error(`Failed to generate client: ${result.errors.join(', ')}`);
    }

    if (existsSync(OUTPUT_DIR)) renameSync(OUTPUT_DIR, previousDir);
    renameSync(nextDir, OUTPUT_DIR);
    console.log(`[E2E Setup] Generated ${result.files.length} files`);
  } finally {
    rmSync(nextDir, { recursive: true, force: true });
    rmSync(previousDir, { recursive: true, force: true });
  }
}

async function prepareDatabase(): Promise<void> {
  const { CerialClient, testConfig, globalCleanup } = await import('./test-helper');
  const database = testConfig.database;

  // The name can come from CERIAL_E2E_DB, so it is validated before it reaches a statement
  if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error(`Invalid e2e database name: ${database}`);

  if (database !== 'main') {
    // A database is not created lazily: DEFINE TABLE into a missing one fails NotFound
    const admin = new CerialClient();
    await admin.connect({ ...testConfig, database: 'main' });
    try {
      await admin.getSurreal()?.query(`DEFINE DATABASE IF NOT EXISTS ${database};`);
    } finally {
      await admin.disconnect();
    }
  }

  console.log(`[E2E Setup] Running global database cleanup and migration on ${database}...`);
  const client = new CerialClient();
  await client.connect(testConfig);
  await globalCleanup(client);
  await client.disconnect();
  console.log(`[E2E Setup] Database ${database} ready`);
}

/**
 * Teardown function - cleans up generated files
 * Called after tests complete
 */
export async function teardown(): Promise<void> {
  // Optionally clean up generated files after tests
  // Keeping them can be useful for debugging
  // if (existsSync(OUTPUT_DIR)) {
  //   rmSync(OUTPUT_DIR, { recursive: true, force: true });
  // }
}

// Export paths for use in tests
export const paths = {
  e2eDir: E2E_DIR,
  schemaDir: SCHEMA_DIR,
  outputDir: OUTPUT_DIR,
};
