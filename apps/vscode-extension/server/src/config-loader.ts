/**
 * Node.js-compatible config loader for cerial.config.json/.ts files.
 *
 * IMPORTANT: Does NOT import src/cli/config/loader.ts — that uses Bun.file().
 * Uses fs.readFileSync + JSON.parse for JSON configs, regex extraction for TS configs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CerialConfig, FolderConfig } from '../../../orm/src/cli/config/types';
import { toFilterPath } from '../../../orm/src/cli/filters/path-utils';
import type { PathFilter } from '../../../orm/src/cli/filters/types';
import { NO_FILTER } from '../../../orm/src/cli/filters/types';

/** Config file names in priority order */
const CONFIG_FILE_NAMES = ['cerial.config.json', 'cerial.config.ts'] as const;

/** Directories to skip when scanning for configs or schema files */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);

/**
 * Attempt to extract a simple CerialConfig from a TypeScript config file.
 *
 * Only handles flat JSON-like structures inside `defineConfig({...})` or
 * `export default {...}`. Complex configs with dynamic expressions are skipped.
 *
 * @returns Parsed config or null if extraction fails
 */
function extractConfigFromTs(content: string): CerialConfig | null {
  // Try to find defineConfig({...}) or export default {...}
  // Match the outermost object literal
  const patterns = [/defineConfig\(\s*(\{[\s\S]*\})\s*\)/, /export\s+default\s+(\{[\s\S]*\})\s*;?\s*$/m];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (!match?.[1]) continue;

    try {
      // Attempt to parse the object literal as JSON
      // Replace single quotes with double quotes, remove trailing commas
      let jsonLike = match[1]
        .replace(/'/g, '"')
        .replace(/,\s*([}\]])/g, '$1')
        // Remove comments
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');

      // Remove unquoted keys and re-quote them
      jsonLike = jsonLike.replace(/(\w+)\s*:/g, '"$1":');

      // Fix double-quoted keys that were already quoted
      jsonLike = jsonLike.replace(/"+"(\w+)"+"\s*:/g, '"$1":');

      return JSON.parse(jsonLike) as CerialConfig;
    } catch {}
  }

  return null;
}

/**
 * Load a cerial config file from a workspace directory.
 *
 * Searches for `cerial.config.json` first, then `cerial.config.ts`.
 * Returns null if no config found or parsing fails.
 *
 * @param workspacePath - Absolute path to the workspace root directory
 */
export function loadCerialConfig(workspacePath: string): CerialConfig | null {
  for (const fileName of CONFIG_FILE_NAMES) {
    const configPath = path.join(workspacePath, fileName);

    try {
      if (!fs.existsSync(configPath)) continue;

      const content = fs.readFileSync(configPath, 'utf-8');

      if (fileName.endsWith('.json')) {
        return JSON.parse(content) as CerialConfig;
      }

      // TypeScript config — attempt regex extraction
      const extracted = extractConfigFromTs(content);
      if (extracted) return extracted;

      // Can't parse TS config statically — skip with no error
      // (user would need to use JSON config for full LSP support)
    } catch {}
  }

  return null;
}

/**
 * Find all `.cerial` files in a directory tree (recursive).
 *
 * Uses fs.readdirSync for Node.js compatibility (no Bun.Glob).
 *
 * @param dirPath - Absolute path to scan
 * @param filter - Optional PathFilter to include/exclude files
 * @returns Array of absolute file paths
 */
export function findCerialFiles(dirPath: string, filter: PathFilter = NO_FILTER): string[] {
  const results: string[] = [];

  function scan(currentPath: string): void {
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          // Skip common non-schema directories
          if (SKIP_DIRS.has(entry.name)) {
            continue;
          }
          scan(fullPath);
        } else if (entry.name.endsWith('.cerial')) {
          const relativePath = toFilterPath(fullPath, dirPath);
          if (!filter.shouldInclude(relativePath)) continue;
          results.push(fullPath);
        }
      }
    } catch {
      // Permission error or directory doesn't exist — skip
    }
  }

  scan(dirPath);
  return results;
}

/**
 * Load a folder-level cerial config from a directory.
 *
 * Similar to `loadCerialConfig()` but rejects root configs (those with
 * `schema` or `schemas` keys). Only returns configs that describe a
 * single schema folder (FolderConfig).
 *
 * @param dir - Absolute path to the directory to check
 * @returns Parsed FolderConfig or null if not found / is a root config
 */
export function loadFolderConfig(dir: string): FolderConfig | null {
  for (const fileName of CONFIG_FILE_NAMES) {
    const configPath = path.join(dir, fileName);

    try {
      if (!fs.existsSync(configPath)) continue;

      const content = fs.readFileSync(configPath, 'utf-8');
      let parsed: Record<string, unknown> | null = null;

      if (fileName.endsWith('.json')) {
        parsed = JSON.parse(content) as Record<string, unknown>;
      } else {
        // TypeScript config — attempt regex extraction
        parsed = extractConfigFromTs(content) as Record<string, unknown> | null;
      }

      if (!parsed) continue;

      // Root configs have schema/schemas keys — not a folder config
      if ('schema' in parsed || 'schemas' in parsed) return null;

      return parsed as FolderConfig;
    } catch {}
  }

  return null;
}

/**
 * Discover folder-level cerial configs in immediate subdirectories.
 *
 * Scans only one level deep (not recursive). Skips common non-schema
 * directories (node_modules, .git, dist).
 *
 * @param workspacePath - Absolute path to the workspace root
 * @returns Array of { dir, config } for each discovered folder config
 */
export function findFolderConfigs(workspacePath: string): Array<{ dir: string; config: FolderConfig }> {
  const results: Array<{ dir: string; config: FolderConfig }> = [];

  try {
    const entries = fs.readdirSync(workspacePath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name)) continue;

      const subdir = path.join(workspacePath, entry.name);
      const config = loadFolderConfig(subdir);
      if (config) results.push({ dir: subdir, config });
    }
  } catch {
    // Permission error or directory doesn't exist — skip
  }

  return results;
}
