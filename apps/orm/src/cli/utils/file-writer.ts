/**
 * File writer - writes files using Bun
 */

import { writeFile as fsWriteFile } from 'node:fs/promises';
import { ensureParentDir } from './file-creator';

/** Write options */
export interface WriteOptions {
  /** Whether to create parent directories */
  createDirs?: boolean;
}

/** Write a file */
export async function writeFile(path: string, content: string, options: WriteOptions = {}): Promise<void> {
  const { createDirs = true } = options;

  if (createDirs) {
    await ensureParentDir(path);
  }

  await fsWriteFile(path, content, 'utf-8');
}

/** Write multiple files */
export async function writeFiles(
  files: Array<{ path: string; content: string }>,
  options: WriteOptions = {},
): Promise<void> {
  await Promise.all(files.map((f) => writeFile(f.path, f.content, options)));
}
