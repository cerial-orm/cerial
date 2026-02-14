/**
 * Shared formatting utilities for all generators
 */

import { mkdir } from 'node:fs/promises';
import * as prettier from 'prettier';

/** Prettier config cache */
let prettierConfig: prettier.Options | null = null;

/** Ensure directory exists */
export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/** Load prettier config from workspace root */
async function loadPrettierConfig(outputDir: string): Promise<prettier.Options> {
  if (prettierConfig) return prettierConfig;

  const resolvedConfig = await prettier.resolveConfig(outputDir);

  prettierConfig = {
    ...resolvedConfig,
    parser: 'typescript',
  };

  return prettierConfig;
}

/** Format TypeScript code with prettier */
export async function formatCode(code: string, outputDir: string): Promise<string> {
  try {
    const config = await loadPrettierConfig(outputDir);

    return await prettier.format(code, config);
  } catch {
    // If prettier fails, return the original code
    return code;
  }
}
