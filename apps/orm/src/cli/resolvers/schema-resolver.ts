import { existsSync, lstatSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import fg from 'fast-glob';
import { CerialGenerationError } from '../../errors';
import { findFolderConfigs } from '../config/loader';
import type { FolderConfig } from '../config/types';
import { toFilterPath } from '../filters/path-utils';
import type { PathFilter } from '../filters/types';
import { isInsideRealRoot, logger } from '../utils';

const DEFAULT_SEARCH_PATHS = ['schemas', 'schema'];

const DEFAULT_PATTERNS = ['**/*.cerial', '**/*.schema.ts'];

export const CONVENTION_MARKERS = ['schema.cerial', 'main.cerial', 'index.cerial', '*.schema.ts'] as const;

/** A TypeScript schema module by name: `x.schema.ts`, never `x.schema.d.ts`, `x.test.ts` or `handles.ts` */
export function isTypescriptSchemaFile(filename: string | null): boolean {
  if (!filename) return false;

  return filename.endsWith('.schema.ts');
}

/** A schema file of either kind: a `.cerial` file or a TypeScript schema module */
export function isSchemaFile(filename: string | null): boolean {
  if (!filename) return false;

  return filename.endsWith('.cerial') || isTypescriptSchemaFile(filename);
}

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

/** Never searched: a dependency's files are not the project's schema. An explicit path inside it still works. */
const NODE_MODULES = ['**/node_modules/**'];

/** Keeps the paths whose real path stays under `root`; a symlink that leaves it is skipped and reported. */
function keepInsideRoot(root: string, paths: string[]): string[] {
  return paths.filter((path) => {
    if (isInsideRealRoot(root, path)) return true;
    logger.warn(`Skipped ${path}: it is a symlink that resolves outside ${root}`);

    return false;
  });
}

/**
 * Find schema files in a directory. `node_modules` is never entered below it, and a match whose real path is
 * outside `root` (the directory itself unless the caller names the project root) is not followed.
 */
export async function findSchemasInDir(dir: string, patterns: string[], root: string = dir): Promise<string[]> {
  const files: string[] = [];

  for (const pattern of patterns) {
    try {
      const matches = await fg(pattern, { cwd: dir, onlyFiles: true, dot: false, ignore: NODE_MODULES });
      for (const file of matches) {
        files.push(resolve(dir, file));
      }
    } catch {
      // Directory might not exist
    }
  }

  // fast-glob returns matches in traversal order, which varies between runs; output order follows it
  return keepInsideRoot(root, files).sort();
}

/** Find schema files in a directory, then apply a PathFilter */
export async function findFilteredSchemasInDir(
  dir: string,
  patterns: string[],
  filter: PathFilter,
  root: string = dir,
): Promise<string[]> {
  const allFiles = await findSchemasInDir(dir, patterns, root);

  return allFiles.filter((file) => filter.shouldInclude(toFilterPath(file, dir)));
}

/** Recursively find directories matching a folder name */
async function findDirectoriesByName(cwd: string, folderName: string): Promise<string[]> {
  const matchingDirs: string[] = [];

  try {
    // Use glob pattern to find all paths ending with folderName
    const matches = await fg(`**/${folderName}`, { cwd, onlyDirectories: true, dot: false, ignore: NODE_MODULES });

    for (const match of matches) {
      // Use resolve for cross-platform path handling
      const fullPath = resolve(cwd, match);

      // Verify it's a directory using lstatSync
      try {
        const stat = lstatSync(fullPath);
        if (stat.isDirectory() && isInsideRealRoot(cwd, fullPath)) matchingDirs.push(fullPath);
      } catch {
        // Not accessible or doesn't exist
      }
    }
  } catch {
    // Directory might not exist or be inaccessible
  }

  return matchingDirs.sort();
}

/** Resolve schema files */
export async function resolveSchemas(options: SchemaResolveOptions = {}): Promise<string[]> {
  const { paths = DEFAULT_SEARCH_PATHS, patterns = DEFAULT_PATTERNS, cwd = process.cwd(), filter } = options;

  // Explicit paths are the caller's choice and search from themselves; discovery stays under `cwd`
  const findFiles = (dir: string, root: string = dir) =>
    filter ? findFilteredSchemasInDir(dir, patterns, filter, root) : findSchemasInDir(dir, patterns, root);

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

  // Without a config the project root is `cwd`: look for the default folders there and below, never above or beside
  const found: { dir: string; files: string[] }[] = [];
  for (const searchPath of paths) {
    for (const dir of await findDirectoriesByName(cwd, searchPath)) {
      // A folder inside another match is already read through its parent's recursive patterns
      if (found.some((other) => dir.startsWith(`${other.dir}/`))) continue;

      const files = await findFiles(dir, cwd);
      if (files.length) found.push({ dir, files });
    }
  }

  if (found.length > 1) {
    const list = found.map(({ dir }) => `  ${relative(cwd, dir) || '.'}`).join('\n');
    throw new CerialGenerationError(
      `Found ${found.length} schema folders and no config to choose between them:\n${list}\nAdd a cerial.config.ts (run 'cerial init') or pass -s <path>.`,
    );
  }

  return found[0]?.files ?? [];
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

  if (exists && isSchemaFile(fullPath)) {
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
    if (marker === TS_MARKER) continue;

    try {
      const matches = await fg(`**/${marker}`, { cwd, dot: false, ignore: NODE_MODULES });
      for (const match of matches) {
        const fullPath = resolve(cwd, match);
        const dir = dirname(fullPath);
        if (!isInsideRealRoot(cwd, fullPath)) continue;

        if (rootMap.has(dir)) continue;

        // Filter check: if the directory is excluded, skip it
        // Use synthetic child path so patterns like 'dir/**' match correctly
        const dirRelative = toFilterPath(dir, cwd);
        if (filter && dirRelative && !filter.shouldInclude(`${dirRelative}/_`)) continue;

        const files = await findSchemasInDir(dir, DEFAULT_PATTERNS, cwd);
        rootMap.set(dir, { path: dir, marker: basename(match), files });
      }
    } catch {
      // Directory might not exist
    }
  }

  await addTypescriptRoots(rootMap, cwd, filter);

  return [...rootMap.values()];
}

const TS_MARKER = '*.schema.ts';

/**
 * A project of TypeScript schema modules alone: with any `.cerial` file present the `.cerial` rules decide,
 * so an outside `*.schema.ts` never adds a root or turns a legacy layout into a multi-root one.
 */
async function addTypescriptRoots(rootMap: Map<string, SchemaRoot>, cwd: string, filter?: PathFilter): Promise<void> {
  try {
    const ignore = NODE_MODULES;
    const cerialFiles = await fg('**/*.cerial', { cwd, dot: false, ignore });
    if (cerialFiles.length) return;

    const matches = (await fg(`**/${TS_MARKER}`, { cwd, dot: false, ignore })).sort();
    const dirs = new Map<string, string>();
    for (const match of matches) {
      if (!isInsideRealRoot(cwd, resolve(cwd, match))) continue;
      const dir = dirname(resolve(cwd, match));
      if (!dirs.has(dir)) dirs.set(dir, basename(match));
    }

    for (const [dir, marker] of dirs) {
      // The parent's `**/` pattern already collects a nested directory
      if ([...dirs.keys()].some((other) => other !== dir && dir.startsWith(`${other}/`))) continue;

      const dirRelative = toFilterPath(dir, cwd);
      if (filter && dirRelative && !filter.shouldInclude(`${dirRelative}/_`)) continue;

      rootMap.set(dir, { path: dir, marker, files: await findSchemasInDir(dir, DEFAULT_PATTERNS, cwd) });
    }
  } catch {
    // Directory might not exist
  }
}

export async function discoverSchemas(cwd: string = process.cwd()): Promise<DiscoveredSchema[]> {
  const folderConfigs = await findFolderConfigs(cwd);

  if (folderConfigs.length) {
    const schemas: DiscoveredSchema[] = [];
    for (const { dir, config } of folderConfigs) {
      const files = await findSchemasInDir(dir, DEFAULT_PATTERNS, cwd);
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
  throw new CerialGenerationError(
    `Found ${roots.length} schema roots (${paths}). Create a cerial.config.ts to configure them. Run 'cerial init' to get started.`,
  );
}
