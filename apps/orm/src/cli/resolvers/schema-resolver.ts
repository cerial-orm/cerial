import { existsSync, lstatSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import fg from 'fast-glob';
import { findFolderConfigs } from '../config/loader';
import type { FolderConfig } from '../config/types';
import { toFilterPath } from '../filters/path-utils';
import type { PathFilter } from '../filters/types';

const DEFAULT_SEARCH_PATHS = ['schemas', 'schema'];

const DEFAULT_PATTERNS = ['**/*.cerial'];

export const CONVENTION_MARKERS = ['schema.cerial', 'main.cerial', 'index.cerial'] as const;

export interface SchemaRoot {
  path: string;
  marker: string | null;
  files: string[];
}

export interface DiscoveredSchema {
  name?: string;
  path: string;
  files: string[];
  folderConfig?: FolderConfig;
}

/** Options for schema resolution */
export interface SchemaResolveOptions {
  /** Custom schema path(s) */
  paths?: string[];
  /** Custom patterns */
  patterns?: string[];
  /** Base directory */
  cwd?: string;
  /** Optional path filter for include/exclude */
  filter?: PathFilter;
}

/** Find schema files in a directory */
export async function findSchemasInDir(dir: string, patterns: string[]): Promise<string[]> {
  const files: string[] = [];

  for (const pattern of patterns) {
    try {
      const matches = await fg(pattern, { cwd: dir, onlyFiles: true, dot: false });
      for (const file of matches) {
        files.push(resolve(dir, file));
      }
    } catch {
      // Directory might not exist
    }
  }

  return files;
}

/** Find schema files in a directory, then apply a PathFilter */
export async function findFilteredSchemasInDir(dir: string, patterns: string[], filter: PathFilter): Promise<string[]> {
  const allFiles = await findSchemasInDir(dir, patterns);

  return allFiles.filter((file) => filter.shouldInclude(toFilterPath(file, dir)));
}

/** Recursively find directories matching a folder name */
async function findDirectoriesByName(cwd: string, folderName: string): Promise<string[]> {
  const matchingDirs: string[] = [];

  try {
    // Use glob pattern to find all paths ending with folderName
    const matches = await fg(`**/${folderName}`, { cwd, onlyDirectories: true, dot: false });

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
  const { paths = DEFAULT_SEARCH_PATHS, patterns = DEFAULT_PATTERNS, cwd = process.cwd(), filter } = options;

  const findFiles = filter
    ? (dir: string) => findFilteredSchemasInDir(dir, patterns, filter)
    : (dir: string) => findSchemasInDir(dir, patterns);

  // If custom paths are provided, use the old behavior
  if (options.paths) {
    const allFiles: string[] = [];
    for (const searchPath of paths) {
      const fullPath = searchPath.startsWith('/') ? searchPath : resolve(cwd, searchPath);
      const files = await findFiles(fullPath);
      allFiles.push(...files);
    }

    return [...new Set(allFiles)];
  }

  // Recursively search for folders with default search path names
  for (const searchPath of paths) {
    const matchingDirs = await findDirectoriesByName(cwd, searchPath);

    // For each matching directory, look for schema files
    for (const dir of matchingDirs) {
      const files = await findFiles(dir);

      // If files are found, return them and stop searching
      if (files.length) return files;
    }
  }

  // No schema files found
  return [];
}

/** Resolve a single schema path (file or directory) */
export async function resolveSinglePath(
  path: string,
  cwd: string = process.cwd(),
  filter?: PathFilter,
): Promise<string[]> {
  const fullPath = path.startsWith('/') ? path : resolve(cwd, path);

  // Check if it's a file
  const exists = existsSync(fullPath);

  if (exists && fullPath.endsWith('.cerial')) {
    if (filter && !filter.shouldInclude(toFilterPath(fullPath, dirname(fullPath)))) return [];

    return [fullPath];
  }

  // Treat as directory
  if (filter) return findFilteredSchemasInDir(fullPath, DEFAULT_PATTERNS, filter);

  return findSchemasInDir(fullPath, DEFAULT_PATTERNS);
}

export async function findSchemaRoots(cwd: string = process.cwd(), filter?: PathFilter): Promise<SchemaRoot[]> {
  const rootMap = new Map<string, SchemaRoot>();

  for (const marker of CONVENTION_MARKERS) {
    try {
      const matches = await fg(`**/${marker}`, { cwd, dot: false });
      for (const match of matches) {
        if (match.includes('node_modules/')) continue;

        const fullPath = resolve(cwd, match);
        const dir = dirname(fullPath);

        if (rootMap.has(dir)) continue;

        // Filter check: if the directory is excluded, skip it
        // Use synthetic child path so patterns like 'dir/**' match correctly
        const dirRelative = toFilterPath(dir, cwd);
        if (filter && dirRelative && !filter.shouldInclude(`${dirRelative}/_`)) continue;

        const files = await findSchemasInDir(dir, DEFAULT_PATTERNS);
        rootMap.set(dir, { path: dir, marker: basename(match), files });
      }
    } catch {
      // Directory might not exist
    }
  }

  return [...rootMap.values()];
}

export async function discoverSchemas(cwd: string = process.cwd()): Promise<DiscoveredSchema[]> {
  const folderConfigs = await findFolderConfigs(cwd);

  if (folderConfigs.length) {
    const schemas: DiscoveredSchema[] = [];
    for (const { dir, config } of folderConfigs) {
      const files = await findSchemasInDir(dir, DEFAULT_PATTERNS);
      if (files.length) {
        schemas.push({
          name: basename(dir),
          path: dir,
          files,
          folderConfig: config,
        });
      }
    }

    if (schemas.length) return schemas;
  }

  const roots = await findSchemaRoots(cwd);

  if (!roots.length) {
    const legacyFiles = await resolveSchemas({ cwd });
    if (!legacyFiles.length) return [];

    return [{ path: cwd, files: legacyFiles }];
  }

  if (roots.length === 1) {
    const [root] = roots;

    return [{ path: root!.path, files: root!.files }];
  }

  const paths = roots.map((r) => r.path).join(', ');
  throw new Error(
    `Found ${roots.length} schema roots (${paths}). Create a cerial.config.ts to configure them. Run 'cerial init' to get started.`,
  );
}
