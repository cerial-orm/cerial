/**
 * Format orchestration - discovers and formats .cerial schema files
 */

import { relative } from 'node:path';
import { formatCerialSource } from '../formatter/formatter';
import { resolveConfig as resolveFormatConfig } from '../formatter/rules';
import type { FormatConfig } from '../formatter/types';
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
    const content = await Bun.file(filePath).text();
    const result = formatCerialSource(content, config);

    if (result.error) {
      return {
        path: filePath,
        changed: false,
        error: result.error,
      };
    }

    if (result.changed && !check) {
      await Bun.write(filePath, result.formatted);
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
  const files = await findSchemasInDir(options.schemaPath, ['**/*.cerial']);

  const summary: FormatSummary = {
    total: files.length,
    formatted: 0,
    unchanged: 0,
    errors: [],
  };

  for (const filePath of files) {
    const result = await formatSingleFile(filePath, config, options.check);

    if (options.verbose) {
      const rel = relative(process.cwd(), filePath);
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
        path: filePath,
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

  return summary;
}
