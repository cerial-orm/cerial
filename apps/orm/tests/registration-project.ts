/**
 * Throwaway projects for registration tests. Their modules import the authoring surface by absolute path
 * to source, so no build is needed.
 */

import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/** The authoring surface, as a project's modules import it */
export const SCHEMA_SRC = resolve(import.meta.dir, '../src/schema');

const created: string[] = [];

/** Write `files` (relative path to text) into a new directory and return its real path */
export async function tempProject(files: Record<string, string>): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'cerial-registration-')));
  created.push(dir);
  for (const [name, text] of Object.entries(files)) {
    await mkdir(dirname(join(dir, name)), { recursive: true });
    await writeFile(join(dir, name), text);
  }

  return dir;
}

/** For `afterAll` */
export async function removeTempProjects(): Promise<void> {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
}

/** A module declaring `export const <name> = model(...)` with an id and one string field */
export function modelModule(name: string, extra = ''): string {
  return `import { f, model } from '${SCHEMA_SRC}';\n${extra}export const ${name} = model('${name}', { id: f.record().id(), label: f.string() });\n`;
}

/** An entry module importing `names` from `./<name>` and registering them */
export function entryModule(names: readonly string[], listed: readonly string[] = names): string {
  const imports = names.map((n) => `import { ${n} } from './${n.toLowerCase()}';`).join('\n');

  return `import { defineSchema } from '${SCHEMA_SRC}';\n${imports}\n\nexport default defineSchema({ models: [${listed.join(', ')}] });\n`;
}
