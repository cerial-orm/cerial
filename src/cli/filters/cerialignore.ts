import { resolve } from 'node:path';
import type { CerialIgnoreFile } from './types';

const CERIALIGNORE_FILENAME = '.cerialignore';

export async function loadCerialIgnore(dir: string): Promise<CerialIgnoreFile | null> {
  const filePath = resolve(dir, CERIALIGNORE_FILENAME);
  const file = Bun.file(filePath);

  if (!(await file.exists())) return null;

  const content = await file.text();

  return { path: filePath, dir, content };
}

export async function findCerialIgnoreFiles(
  cwd: string,
  schemaDirs?: string[],
): Promise<{ root?: CerialIgnoreFile; folders: Map<string, CerialIgnoreFile> }> {
  const root = (await loadCerialIgnore(cwd)) ?? undefined;
  const folders = new Map<string, CerialIgnoreFile>();

  if (schemaDirs) {
    for (const dir of schemaDirs) {
      const file = await loadCerialIgnore(dir);
      if (file) folders.set(dir, file);
    }
  }

  return { root, folders };
}
