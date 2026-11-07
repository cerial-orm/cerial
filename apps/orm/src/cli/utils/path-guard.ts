import { realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** The real path of `path`; a part that does not exist yet is appended to its nearest existing parent. */
export function realPathLoose(path: string): string {
  const absolute = resolve(path);
  try {
    return realpathSync(absolute);
  } catch {
    const parent = dirname(absolute);
    if (parent === absolute) return absolute;

    return join(realPathLoose(parent), basename(absolute));
  }
}

function within(root: string, path: string): boolean {
  const rel = relative(root, path);

  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** True when the real path of `path` is `root` or lies under the real path of `root`. */
export function isInsideRealRoot(root: string, path: string): boolean {
  return within(realPathLoose(root), realPathLoose(path));
}

/** True when the real path of `path` is outside the real path of `root`: a write or delete there is refused. */
export function escapesRoot(root: string, path: string): boolean {
  return !isInsideRealRoot(root, path);
}

/**
 * True when the real path of `path` stays under the real path of `root` without passing through a `node_modules`
 * folder below it: a link that leads into a dependency or out of the project is not the project's own.
 */
export function isProjectOwned(root: string, path: string): boolean {
  const realRoot = realPathLoose(root);
  const real = realPathLoose(path);
  if (!within(realRoot, real)) return false;

  return !relative(realRoot, real).split(sep).includes('node_modules');
}
