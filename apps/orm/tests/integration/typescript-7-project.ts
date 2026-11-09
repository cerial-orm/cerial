/**
 * A project whose installed `cerial` is a copy of the built package and whose `typescript` is the repo's TypeScript 7
 * alias, so the CLI resolves the user's TypeScript the way a real install does. A linked package would resolve
 * `typescript` from the repository instead and never meet version 7.
 */

import { cp, mkdir, mkdtemp, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const PACKAGE = join(import.meta.dir, '../..');
// Resolved from the repository's installed packages, the aliases and every dependency of the package
const MODULES = [join(PACKAGE, 'node_modules'), join(PACKAGE, '../../node_modules')];
const NOT_LINKED = new Set(['cerial', 'typescript', 'typescript-7', '.bin']);

export async function typescript7Project(
  files: Record<string, string>,
  cleanups: Array<() => Promise<void>>,
): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'cerial-ts7-')));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const modules = join(dir, 'node_modules');
  await mkdir(modules);
  for (const root of MODULES) {
    for (const name of await readdir(root).catch(() => [])) {
      if (NOT_LINKED.has(name)) continue;
      await symlink(await realpath(join(root, name)), join(modules, name)).catch(() => undefined);
    }
  }
  await symlink(await realpath(join(PACKAGE, 'node_modules/typescript-7')), join(modules, 'typescript'));
  await mkdir(join(modules, 'cerial'));
  await cp(join(PACKAGE, 'dist'), join(modules, 'cerial/dist'), { recursive: true });
  await cp(join(PACKAGE, 'package.json'), join(modules, 'cerial/package.json'));
  await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
  await writeFile(join(dir, 'cerial.config.ts'), "export default { schema: './schemas', output: './out' };\n");
  for (const [name, text] of Object.entries(files)) {
    await mkdir(dirname(join(dir, name)), { recursive: true });
    await writeFile(join(dir, name), text);
  }

  return dir;
}
