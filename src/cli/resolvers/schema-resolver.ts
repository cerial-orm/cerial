/**
 * Schema resolver - resolves schema file locations
 */

import { Glob } from 'bun';

/** Default schema search paths */
const DEFAULT_SEARCH_PATHS = [
  'schemas',
  'schema',
  'prisma',
  'db',
  '.',
];

/** Default schema file patterns */
const DEFAULT_PATTERNS = [
  '*.schema',
];

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
        files.push(`${dir}/${file}`);
      }
    } catch {
      // Directory might not exist
    }
  }

  return files;
}

/** Resolve schema files */
export async function resolveSchemas(options: SchemaResolveOptions = {}): Promise<string[]> {
  const {
    paths = DEFAULT_SEARCH_PATHS,
    patterns = DEFAULT_PATTERNS,
    cwd = process.cwd(),
  } = options;

  const allFiles: string[] = [];

  for (const searchPath of paths) {
    const fullPath = searchPath.startsWith('/') ? searchPath : `${cwd}/${searchPath}`;
    const files = await findSchemasInDir(fullPath, patterns);
    allFiles.push(...files);
  }

  // Remove duplicates
  return [...new Set(allFiles)];
}

/** Resolve a single schema path (file or directory) */
export async function resolveSinglePath(path: string, cwd: string = process.cwd()): Promise<string[]> {
  const fullPath = path.startsWith('/') ? path : `${cwd}/${path}`;

  // Check if it's a file
  const file = Bun.file(fullPath);
  const exists = await file.exists();

  if (exists) {
    // Check if it ends with schema extension
    if (fullPath.endsWith('.schema') || fullPath.endsWith('.prisma')) {
      return [fullPath];
    }
  }

  // Treat as directory
  return findSchemasInDir(fullPath, DEFAULT_PATTERNS);
}
