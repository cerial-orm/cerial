/**
 * Config resolver - resolves config to absolute paths and computed values
 */

import { dirname, resolve, sep } from 'node:path';
import type { FormatConfig } from '../../formatter/types';
import { isSchemaFile } from '../resolvers/schema-resolver';
import { toClientClassName } from './name-utils';
import type { CerialConfig, ResolvedSchemaEntry } from './types';
import { DEFAULT_TYPE_FILES } from './types';

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
      typeFiles: config.typeFiles ?? DEFAULT_TYPE_FILES,
    },
  ];
}

function resolveMultiSchema(config: CerialConfig, cwd: string): ResolvedSchemaEntry[] {
  const schemas = config.schemas!;
  const rootOutput = config.output;

  return Object.entries(schemas).map(([name, entry]) => {
    const entryModule = entry.entry ? toAbsolute(entry.entry, cwd) : undefined;
    const files = entry.files?.length ? entry.files.map((file) => toAbsolute(file, cwd)) : undefined;
    // A schema with no path has no root of its own; its scope is the folder its entry and listed files share
    const absolutePath = entry.path
      ? toAbsolute(entry.path, cwd)
      : commonDirectory([...(entryModule ? [entryModule] : []), ...(files ?? [])]);
    const output = entry.output
      ? toAbsolute(entry.output, cwd)
      : rootOutput
        ? toAbsolute(rootOutput, cwd)
        : getDefaultOutput(absolutePath);

    // Merge format config: schema.format overrides root.format
    let format: FormatConfig | undefined;
    if (entry.format || config.format) {
      const merged = { ...config.format, ...entry.format };
      format = Object.keys(merged).length > 0 ? merged : undefined;
    }

    return {
      name,
      path: absolutePath,
      ...(entryModule ? { entry: entryModule } : {}),
      ...(files ? { files } : {}),
      ...(entryModule || files ? { entryOnly: !entry.path } : {}),
      output,
      clientClassName: toClientClassName(name),
      connection: entry.connection ?? config.connection,
      explicitDatabase: entry.connection?.database,
      format,
      typeFiles: entry.typeFiles ?? config.typeFiles ?? DEFAULT_TYPE_FILES,
    };
  });
}

function toAbsolute(path: string, cwd: string): string {
  if (path.startsWith('/')) {
    return path;
  }

  return resolve(cwd, path);
}

/** The deepest directory that holds every file */
function commonDirectory(files: string[]): string {
  const [first, ...rest] = files.map((file) => dirname(file).split(sep));
  const shared = first!.findIndex((part, i) => !rest.every((parts) => parts[i] === part));

  return first!.slice(0, shared === -1 ? undefined : shared).join(sep) || sep;
}

function getDefaultOutput(schemaPath: string): string {
  const dir = isSchemaFile(schemaPath) ? dirname(schemaPath) : schemaPath;

  return resolve(dir, 'client');
}
