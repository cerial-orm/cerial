/**
 * Config resolver - resolves config to absolute paths and computed values
 */

import { dirname, resolve } from 'node:path';
import { toClientClassName } from './name-utils';
import type { CerialConfig, ResolvedSchemaEntry } from './types';

/**
 * Resolve configuration to absolute paths and computed values
 * @param config - Cerial configuration
 * @param cwd - Working directory for relative path resolution (defaults to process.cwd())
 * @returns Array of resolved schema entries
 */
export function resolveConfig(config: CerialConfig, cwd: string = process.cwd()): ResolvedSchemaEntry[] {
  if (config.schemas) {
    return resolveMultiSchema(config, cwd);
  }

  if (config.schema) {
    return resolveSingleSchema(config, cwd);
  }

  return [];
}

function resolveSingleSchema(config: CerialConfig, cwd: string): ResolvedSchemaEntry[] {
  const schemaPath = config.schema!;
  const absolutePath = toAbsolute(schemaPath, cwd);
  const output = config.output ? toAbsolute(config.output, cwd) : getDefaultOutput(absolutePath);

  // Only include format if it has properties
  const format = config.format && Object.keys(config.format).length > 0 ? config.format : undefined;

  return [
    {
      name: 'default',
      path: absolutePath,
      output,
      clientClassName: 'CerialClient',
      connection: config.connection,
      format,
    },
  ];
}

function resolveMultiSchema(config: CerialConfig, cwd: string): ResolvedSchemaEntry[] {
  const schemas = config.schemas!;
  const rootOutput = config.output;

  return Object.entries(schemas).map(([name, entry]) => {
    const absolutePath = toAbsolute(entry.path, cwd);
    const output = entry.output
      ? toAbsolute(entry.output, cwd)
      : rootOutput
        ? toAbsolute(rootOutput, cwd)
        : getDefaultOutput(absolutePath);

    // Merge format config: schema.format overrides root.format
    let format: Record<string, unknown> | undefined;
    if (entry.format || config.format) {
      const merged = { ...config.format, ...entry.format };
      format = Object.keys(merged).length > 0 ? merged : undefined;
    }

    return {
      name,
      path: absolutePath,
      output,
      clientClassName: toClientClassName(name),
      connection: entry.connection ?? config.connection,
      format: format as any,
    };
  });
}

function toAbsolute(path: string, cwd: string): string {
  if (path.startsWith('/')) {
    return path;
  }

  return resolve(cwd, path);
}

function getDefaultOutput(schemaPath: string): string {
  const dir = schemaPath.endsWith('.cerial') ? dirname(schemaPath) : schemaPath;

  return resolve(dir, 'client');
}
