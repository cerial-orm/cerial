/**
 * Node.js-compatible config loader for cerial.config.json/.ts files.
 *
 * IMPORTANT: Does NOT import src/cli/config/loader.ts — that uses Bun.file().
 * Uses fs.readFileSync + JSON.parse for JSON configs, regex extraction for TS configs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CerialConfig } from '../../../src/cli/config/types';

/** Config file names in priority order */
const CONFIG_FILE_NAMES = ['cerial.config.json', 'cerial.config.ts'] as const;

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
 * @returns Array of absolute file paths
 */
export function findCerialFiles(dirPath: string): string[] {
  const results: string[] = [];

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip common non-schema directories
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
          continue;
        }
        results.push(...findCerialFiles(fullPath));
      } else if (entry.name.endsWith('.cerial')) {
        results.push(fullPath);
      }
    }
  } catch {
    // Permission error or directory doesn't exist — skip
  }

  return results;
}
