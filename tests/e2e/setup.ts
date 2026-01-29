/**
 * E2E Test Setup
 *
 * This file generates the test client before running e2e tests.
 * It simulates the real user experience of:
 * 1. Defining a schema
 * 2. Running the generate command
 * 3. Using the generated client
 */

import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { generate } from '../../src/cli/generate';

const E2E_DIR = resolve(import.meta.dir);
const SCHEMA_DIR = resolve(E2E_DIR, 'schemas');
const OUTPUT_DIR = resolve(E2E_DIR, 'generated');

/**
 * Setup function - generates the test client
 * Called before tests run
 */
export async function setup(): Promise<void> {
  console.log('[E2E Setup] Generating test client...');

  // Clean up previous generated files
  if (existsSync(OUTPUT_DIR)) {
    rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }

  // Generate the client
  const result = await generate({
    schema: SCHEMA_DIR,
    output: OUTPUT_DIR,
    verbose: false,
  });

  if (!result.success) {
    throw new Error(`Failed to generate client: ${result.errors.join(', ')}`);
  }

  console.log(`[E2E Setup] Generated ${result.files.length} files`);
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

// Default test database config
export const testConfig = {
  url: 'http://127.0.0.1:8000',
  namespace: 'test',
  database: 'e2e',
  auth: {
    username: 'root',
    password: 'root',
  },
};
