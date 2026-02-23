/**
 * Sync Node.js reimplementation of the ORM's .cerialignore loader.
 * Uses node:fs sync APIs for VS Code extension compatibility.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CerialIgnoreFile } from '../../../orm/src/cli/filters/types';

const CERIALIGNORE_FILENAME = '.cerialignore';

export function loadCerialIgnoreSync(dir: string): CerialIgnoreFile | null {
  const filePath = path.resolve(dir, CERIALIGNORE_FILENAME);

  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    return { path: filePath, dir, content };
  } catch {
    return null;
  }
}

export function findCerialIgnoreFilesSync(
  cwd: string,
  schemaDirs?: string[],
): { root?: CerialIgnoreFile; folders: Map<string, CerialIgnoreFile> } {
  const root = loadCerialIgnoreSync(cwd) ?? undefined;
  const folders = new Map<string, CerialIgnoreFile>();

  if (schemaDirs) {
    for (const dir of schemaDirs) {
      const file = loadCerialIgnoreSync(dir);
      if (file) folders.set(dir, file);
    }
  }

  return { root, folders };
}
