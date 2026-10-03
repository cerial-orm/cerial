/**
 * Config file loader for cerial.config.ts and cerial.config.json
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import fg from 'fast-glob';
import { CerialConfigNotFolderConfigError, CerialGenerationError } from '../../errors';
import { toFilterPath } from '../filters/path-utils';
import type { PathFilter } from '../filters/types';
import type { CerialConfig, FolderConfig } from './types';
import { detectNestedConfigs, validateConfig, validateFolderConfig } from './validator';

const DEFAULT_SCHEMA_DIRS = ['schemas', 'schema'];

/**
 * Load configuration from cerial.config.ts or cerial.config.json
 * @param configPath - Explicit path to config file (optional)
 * @param cwd - Working directory for relative path resolution (defaults to process.cwd())
 * @returns Loaded and validated config, or null if no config file found
 * @throws Error if config file exists but is invalid or fails to load
 */
export async function loadConfig(configPath?: string, cwd: string = process.cwd()): Promise<CerialConfig | null> {
  let config: CerialConfig | null = null;

  if (configPath) {
    config = await loadConfigFile(configPath);
  } else {
    config = await searchForConfig(cwd);
  }

  if (!config) {
    return null;
  }

  const validation = validateConfig(config);
  if (!validation.valid) {
    const errors = validation.errors.map((e) => `${e.field}: ${e.message}`).join('\n');
    throw new CerialGenerationError(`Invalid cerial config:\n${errors}`);
  }

  return config;
}

async function loadConfigFile(filePath: string): Promise<CerialConfig | null> {
  const absolutePath = filePath.startsWith('/') ? filePath : resolve(process.cwd(), filePath);

  if (absolutePath.endsWith('.ts')) {
    return loadTypeScriptConfig(absolutePath);
  }

  if (absolutePath.endsWith('.json')) {
    return loadJsonConfig(absolutePath);
  }

  throw new CerialGenerationError(`Unsupported config file format: ${absolutePath}`);
}

async function loadTypeScriptConfig(filePath: string): Promise<CerialConfig | null> {
  try {
    const module = await import(filePath);
    const config = module.default;

    if (!config) {
      throw new CerialGenerationError('Config file must have a default export');
    }

    return config as CerialConfig;
  } catch (error) {
    throw new CerialGenerationError(
      `Failed to load cerial.config.ts: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

async function loadJsonConfig(filePath: string): Promise<CerialConfig | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const config = JSON.parse(content);

    return config as CerialConfig;
  } catch (error) {
    throw new CerialGenerationError(
      `Failed to load cerial.config.json: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

async function searchForConfig(cwd: string): Promise<CerialConfig | null> {
  const tsConfigPath = resolve(cwd, 'cerial.config.ts');
  const jsonConfigPath = resolve(cwd, 'cerial.config.json');

  const tsExists = existsSync(tsConfigPath);
  const jsonExists = existsSync(jsonConfigPath);

  if (tsExists) {
    return loadTypeScriptConfig(tsConfigPath);
  }

  if (jsonExists) {
    return loadJsonConfig(jsonConfigPath);
  }

  return null;
}

export async function loadFolderConfig(dir: string): Promise<FolderConfig | null> {
  const tsPath = resolve(dir, 'cerial.config.ts');
  const jsonPath = resolve(dir, 'cerial.config.json');

  const tsExists = existsSync(tsPath);
  const jsonExists = existsSync(jsonPath);

  if (!tsExists && !jsonExists) return null;

  const raw: Record<string, unknown> = tsExists
    ? ((await loadTypeScriptConfig(tsPath)) as Record<string, unknown>)
    : ((await loadJsonConfig(jsonPath)) as Record<string, unknown>);

  const validation = validateFolderConfig(raw);
  if (!validation.valid) {
    const errors = validation.errors.map((e) => `${e.field}: ${e.message}`).join('\n');
    const message = `Invalid folder config in ${dir}:\n${errors}`;
    if ('schema' in raw || 'schemas' in raw) throw new CerialConfigNotFolderConfigError(message);

    throw new CerialGenerationError(message);
  }

  return raw as FolderConfig;
}

export async function findFolderConfigs(
  cwd: string,
  filter?: PathFilter,
): Promise<Array<{ dir: string; config: FolderConfig }>> {
  const results: Array<{ dir: string; config: FolderConfig }> = [];
  // Loading a config executes it, so only look where a schema folder is expected:
  // direct children of the working directory and the default schema directories.
  if (!existsSync(cwd)) return [];

  const matches = await fg(
    ['*/cerial.config.{ts,json}', `{${DEFAULT_SCHEMA_DIRS.join(',')}}/**/cerial.config.{ts,json}`],
    { cwd, onlyFiles: true, ignore: ['**/node_modules/**'] },
  );

  const uniqueDirs = [...new Set(matches.map((match) => dirname(resolve(cwd, match))))];
  if (!uniqueDirs.length) return [];

  // Apply path filter to exclude directories
  // Use synthetic child path so patterns like 'dir/**' match correctly
  const filteredDirs = filter
    ? uniqueDirs.filter((dir) => {
        const relative = toFilterPath(dir, cwd);

        return !relative || filter.shouldInclude(`${relative}/_`);
      })
    : uniqueDirs;
  if (!filteredDirs.length) return [];

  // Load configs, filtering out root-style configs (those with schema/schemas keys)
  for (const dir of filteredDirs) {
    try {
      const config = await loadFolderConfig(dir);
      if (config) results.push({ dir, config });
    } catch (error) {
      // A root-style config in a subdirectory is not a folder config; anything else is a real error.
      if (!(error instanceof CerialConfigNotFolderConfigError)) throw error;
    }
  }

  if (results.length > 1) {
    detectNestedConfigs(results.map((r) => r.dir));
  }

  return results;
}
