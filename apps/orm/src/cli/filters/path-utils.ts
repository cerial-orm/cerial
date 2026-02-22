import { relative } from 'node:path';

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
