import { isAbsolute, relative, sep } from 'node:path';
import type { PathFilter } from './types';

/**
 * Normalize a path by converting backslashes to forward slashes
 * and removing trailing slashes.
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Convert an absolute path to a relative path from a base path,
 * with forward-slash normalization.
 */
export function toFilterPath(absolutePath: string, basePath: string): string {
  const rel = relative(basePath, absolutePath);
  return normalizePath(rel);
}

/**
 * Check if a child path is a subpath of a parent path.
 * Returns true if child equals parent or is a direct/nested child.
 */
export function isSubPath(child: string, parent: string): boolean {
  const normalizedChild = normalizePath(child);
  const normalizedParent = normalizePath(parent);

  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}/`);
}

/**
 * True when `filter` excludes the absolute `file`. The file is matched relative to the first of `bases` that
 * contains it; patterns cannot escape their scope, so a file outside every base is kept.
 */
export function isExcludedFile(file: string, filter: PathFilter | undefined, bases: readonly string[]): boolean {
  if (!filter) return false;
  for (const base of bases) {
    const path = relative(base, file);
    if (path === '' || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) continue;

    return !filter.shouldInclude(normalizePath(path));
  }

  return false;
}
