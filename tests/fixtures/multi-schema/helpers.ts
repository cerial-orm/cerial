/**
 * Multi-schema test fixture helpers
 *
 * Provides utilities for setting up and tearing down temporary output directories
 * for multi-schema generation tests.
 */

import { mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Get absolute path to a fixture directory by name
 */
export function getFixturePath(name: string): string {
  return join(__dirname, name);
}

/**
 * Create a temporary output directory for generation
 * Returns the absolute path to the created directory
 */
export async function createTempOutputDir(): Promise<string> {
  const PROJECT_TMP = resolve(__dirname, '../../../tmp-schema-generates');
  const tempDir = join(PROJECT_TMP, `cerial-test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`);

  await mkdir(tempDir, { recursive: true });

  return tempDir;
}

/**
 * Clean up a temporary directory
 * Removes the directory and all its contents
 */
export async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore errors - directory may not exist
  }
}
