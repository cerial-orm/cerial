/**
 * File creator - creates directories and files
 */

import { mkdir } from 'node:fs/promises';

/** Ensure a directory exists */
export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/** Ensure parent directory exists for a file path */
export async function ensureParentDir(filePath: string): Promise<void> {
  const lastSlash = filePath.lastIndexOf('/');
  if (lastSlash > 0) {
    await ensureDir(filePath.slice(0, lastSlash));
  }
}

/** Create multiple directories */
export async function ensureDirs(dirs: string[]): Promise<void> {
  await Promise.all(dirs.map(ensureDir));
}
