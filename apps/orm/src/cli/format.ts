/**
 * Format orchestration - discovers and formats .cerial schema files
 */

import { readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { formatCerialSource } from '../formatter/formatter';
import { resolveConfig as resolveFormatConfig } from '../formatter/rules';
import type { FormatConfig } from '../formatter/types';
import { isExcludedFile } from './filters/path-utils';
import type { PathFilter } from './filters/types';
import { findSchemasInDir } from './resolvers/schema-resolver';

/** Result from formatting a single file */
export interface FormatFileResult {
  path: string;
  changed: boolean;
  error?: { message: string; line: number; column: number };
}

/** Summary from formatting an entire schema */
export interface FormatSummary {
  total: number;
  formatted: number;
  unchanged: number;
  errors: { path: string; message: string; line: number; column: number }[];
}

/** Options for formatting a schema directory */
export interface FormatSchemaOptions {
  /** Path to schema directory */
  schemaPath: string;
  /** Format config (partial, merged with defaults) */
  formatConfig?: FormatConfig;
  /** Check mode — don't write, just report */
  check?: boolean;
  /** Verbose output */
  verbose?: boolean;
  /** Listed `.cerial` files to format as well, wherever they are; one in the directory counts once */
  files?: readonly string[];
  /** False for an entry-only schema: its folder holds code, so only `files` are formatted */
  directory?: boolean;
}

/**
 * The `.cerial` files a config lists for a schema, minus those the filter cascade excludes: exclusion stays
 * the one mechanism, so a file kept out of generation is kept out of formatting. TypeScript modules are not
 * formatted. Matched as the watch set matches them: relative to the schema path, else to the cwd.
 */
export function listedCerialFiles(target: {
  schemaPath: string;
  files?: readonly string[];
  filter?: PathFilter;
}): string[] {
  const bases = [resolve(target.schemaPath), process.cwd()];

  return (target.files ?? []).filter((file) => file.endsWith('.cerial') && !isExcludedFile(file, target.filter, bases));
}

/**
 * Format a single .cerial file.
 * Reads the file, formats it, and writes back if changed (unless check mode).
 */
export async function formatSingleFile(
  filePath: string,
  config: Required<FormatConfig>,
  check?: boolean,
): Promise<FormatFileResult> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const result = formatCerialSource(content, config);

    if (result.error) {
      return {
        path: filePath,
        changed: false,
        error: result.error,
      };
    }

    if (result.changed && !check) {
      await writeFile(filePath, result.formatted, 'utf-8');
    }

    return {
      path: filePath,
      changed: result.changed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    return {
      path: filePath,
      changed: false,
      error: { message, line: 0, column: 0 },
    };
  }
}

/**
 * Format all .cerial files in a schema directory.
 * Discovers files, formats each, and returns a summary.
 */
export async function formatSchema(options: FormatSchemaOptions): Promise<FormatSummary> {
  const config = resolveFormatConfig(options.formatConfig);
  const found = options.directory === false ? [] : await findSchemasInDir(options.schemaPath, ['**/*.cerial']);
  const files = [...new Set([...found, ...(options.files ?? [])])];

  const summary: FormatSummary = {
    total: files.length,
    formatted: 0,
    unchanged: 0,
    errors: [],
  };

  const BATCH_SIZE = 16;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((f) => formatSingleFile(f, config, options.check)));

    for (let j = 0; j < results.length; j++) {
      const result = results[j]!;

      if (options.verbose) {
        const rel = relative(process.cwd(), batch[j]!);
        if (result.error) {
          console.log(`  ✗ ${rel}:${result.error.line}:${result.error.column}: ${result.error.message}`);
        } else if (result.changed) {
          console.log(`  ✓ ${rel}`);
        } else {
          console.log(`  - ${rel} (unchanged)`);
        }
      }

      if (result.error) {
        summary.errors.push({
          path: result.path,
          message: result.error.message,
          line: result.error.line,
          column: result.error.column,
        });
      } else if (result.changed) {
        summary.formatted++;
      } else {
        summary.unchanged++;
      }
    }
  }

  return summary;
}
