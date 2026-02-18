/**
 * Schema resolver - resolves schema file locations
 */

import { lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { Glob } from 'bun';

/** Default schema search paths */
const DEFAULT_SEARCH_PATHS = ['schemas', 'schema'];

/** Default schema file patterns */
const DEFAULT_PATTERNS = ['*.cerial'];

/** Options for schema resolution */
export interface SchemaResolveOptions {
  /** Custom schema path(s) */
  paths?: string[];
  /** Custom patterns */
  patterns?: string[];
  /** Base directory */
  cwd?: string;
}

/** Find schema files in a directory */
export async function findSchemasInDir(dir: string, patterns: string[]): Promise<string[]> {
  const files: string[] = [];

  for (const pattern of patterns) {
    const glob = new Glob(pattern);
    try {
      for await (const file of glob.scan({ cwd: dir })) {
        files.push(resolve(dir, file));
      }
    } catch {
      // Directory might not exist
    }
  }

  return files;
}

/** Recursively find directories matching a folder name */
async function findDirectoriesByName(cwd: string, folderName: string): Promise<string[]> {
  const matchingDirs: string[] = [];

  try {
    // Use glob pattern to find all paths ending with folderName
    const glob = new Glob(`**/${folderName}`);
    const matches = await Array.fromAsync(glob.scan({ cwd, onlyFiles: false }));

    for (const match of matches) {
      // Use resolve for cross-platform path handling
      const fullPath = resolve(cwd, match);

      // Verify it's a directory using lstatSync
      try {
        const stat = lstatSync(fullPath);
        if (stat.isDirectory()) matchingDirs.push(fullPath);
      } catch {
        // Not accessible or doesn't exist
      }
    }
  } catch {
    // Directory might not exist or be inaccessible
  }

  return matchingDirs;
}

/** Resolve schema files */
export async function resolveSchemas(options: SchemaResolveOptions = {}): Promise<string[]> {
  const { paths = DEFAULT_SEARCH_PATHS, patterns = DEFAULT_PATTERNS, cwd = process.cwd() } = options;

  // If custom paths are provided, use the old behavior
  if (options.paths) {
    const allFiles: string[] = [];
    for (const searchPath of paths) {
      const fullPath = searchPath.startsWith('/') ? searchPath : resolve(cwd, searchPath);
      const files = await findSchemasInDir(fullPath, patterns);
      allFiles.push(...files);
    }
    return [...new Set(allFiles)];
  }

  // Recursively search for folders with default search path names
  for (const searchPath of paths) {
    const matchingDirs = await findDirectoriesByName(cwd, searchPath);

    // For each matching directory, look for schema files
    for (const dir of matchingDirs) {
      const files = await findSchemasInDir(dir, patterns);

      // If files are found, return them and stop searching
      if (files.length) return files;
    }
  }

  // No schema files found
  return [];
}

/** Resolve a single schema path (file or directory) */
export async function resolveSinglePath(path: string, cwd: string = process.cwd()): Promise<string[]> {
  const fullPath = path.startsWith('/') ? path : resolve(cwd, path);

  // Check if it's a file
  const file = Bun.file(fullPath);
  const exists = await file.exists();

  if (exists && fullPath.endsWith('.cerial')) return [fullPath];

  // Treat as directory
  return findSchemasInDir(fullPath, DEFAULT_PATTERNS);
}
