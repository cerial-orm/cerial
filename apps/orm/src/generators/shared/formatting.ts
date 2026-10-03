/**
 * Shared formatting utilities for all generators
 */

import { mkdir } from 'node:fs/promises';
import { format, type FormatOptions } from 'oxfmt';

/** Every option is written down: oxfmt defaults to a 100 column width and double quotes. */
const FORMAT_OPTIONS: FormatOptions = {
  useTabs: false,
  tabWidth: 2,
  printWidth: 120,
  endOfLine: 'lf',
  singleQuote: true,
  trailingComma: 'all',
  semi: true,
  arrowParens: 'always',
  bracketSpacing: true,
};

/** Ensure directory exists */
export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/** Format TypeScript code with oxfmt */
export async function formatCode(code: string, _outputDir: string): Promise<string> {
  try {
    const result = await format('generated.ts', code, FORMAT_OPTIONS);
    if (result.errors.length) return code;

    return result.code;
  } catch {
    // If oxfmt fails, return the original code
    return code;
  }
}
