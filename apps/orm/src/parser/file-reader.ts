/**
 * File reader for schema files
 * Uses Bun's file system APIs
 */

import { Glob } from 'bun';
import type { SchemaFile } from '../types';

/** Default schema file glob patterns */
const DEFAULT_PATTERNS = ['**/*.cerial'];

/** Options for finding schema files */
export interface FindSchemasOptions {
  /** Directory to search in */
  cwd?: string;
  /** Custom glob patterns */
  patterns?: string[];
  /** Whether to include hidden files */
  includeHidden?: boolean;
}

/** Find all schema files in a directory */
export async function findSchemaFiles(options: FindSchemasOptions = {}): Promise<string[]> {
  const { cwd = process.cwd(), patterns = DEFAULT_PATTERNS, includeHidden = false } = options;

  const files: string[] = [];

  for (const pattern of patterns) {
    const glob = new Glob(pattern);
    for await (const file of glob.scan({ cwd, dot: includeHidden })) {
      files.push(file);
    }
  }

  // Remove duplicates
  return [...new Set(files)];
}

/** Read a single schema file */
export async function readSchemaFile(path: string): Promise<SchemaFile> {
  const file = Bun.file(path);
  const content = await file.text();
  return { path, content };
}

/** Read multiple schema files */
export async function readSchemaFiles(paths: string[]): Promise<SchemaFile[]> {
  const results = await Promise.all(paths.map(readSchemaFile));
  return results;
}

/** Find and read all schema files in a directory */
export async function loadSchemas(options: FindSchemasOptions = {}): Promise<SchemaFile[]> {
  const files = await findSchemaFiles(options);
  const cwd = options.cwd ?? process.cwd();

  // Resolve paths relative to cwd
  const absolutePaths = files.map((f) => {
    if (f.startsWith('/')) return f;
    return `${cwd}/${f}`;
  });

  return readSchemaFiles(absolutePaths);
}

/** Check if a file exists */
export async function fileExists(path: string): Promise<boolean> {
  const file = Bun.file(path);
  return file.exists();
}

/** Resolve schema file paths from various inputs */
export async function resolveSchemaPath(input: string): Promise<string[]> {
  // Check if it's a directory
  const stats = await Bun.file(input).exists();

  if (!stats) {
    // Try as a glob pattern
    const glob = new Glob(input);
    const files: string[] = [];
    for await (const file of glob.scan()) {
      files.push(file);
    }
    return files;
  }

  // Single file
  if (input.endsWith('.cerial')) {
    return [input];
  }

  // Directory - find schemas inside
  const files = await findSchemaFiles({ cwd: input });
  return files.map((f) => `${input}/${f}`);
}
