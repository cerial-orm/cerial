import ignore, { type Ignore } from 'ignore';
import { normalizePath } from './path-utils';
import type { FilterConfig, PathFilter, PathFilterOptions } from './types';
import { NO_FILTER } from './types';

function hasPatterns(patterns?: string[]): patterns is string[] {
  return !!patterns && patterns.length > 0;
}

function hasExcludelike(config?: FilterConfig): boolean {
  return hasPatterns(config?.ignore) || hasPatterns(config?.exclude);
}

function buildIgnore(patterns: string[]): Ignore {
  return ignore().add(patterns);
}

/**
 * Build a cascading path filter from config + .cerialignore layers.
 *
 * Resolution order for `shouldInclude(relativePath)`:
 * 1. `ignore` patterns (root + schema + folder) — absolute blacklist, nothing overrides
 * 2. Root `.cerialignore` — overridable by root `include`
 * 3. Root `exclude` — overridable by root `include`
 * 4. Schema `exclude` — overridable by schema `include`
 * 5. Folder `.cerialignore` — overridable by folder `include`
 * 6. Folder `exclude` — overridable by folder `include`
 * 7. Default: included
 */
export function resolvePathFilter(options: PathFilterOptions): PathFilter {
  const { rootConfig, schemaConfig, folderConfig, rootCerialIgnore, folderCerialIgnore } = options;

  const hasAnyFilter =
    hasExcludelike(rootConfig) ||
    hasExcludelike(schemaConfig) ||
    hasExcludelike(folderConfig) ||
    !!rootCerialIgnore ||
    !!folderCerialIgnore;

  if (!hasAnyFilter) return NO_FILTER;

  // Absolute blacklist: ignore from all config levels
  const absolutePatterns: string[] = [];
  if (hasPatterns(rootConfig?.ignore)) absolutePatterns.push(...rootConfig.ignore);
  if (hasPatterns(schemaConfig?.ignore)) absolutePatterns.push(...schemaConfig.ignore);
  if (hasPatterns(folderConfig?.ignore)) absolutePatterns.push(...folderConfig.ignore);
  const absoluteIg = absolutePatterns.length ? buildIgnore(absolutePatterns) : null;

  // Root layer
  const rootCerialIg = rootCerialIgnore ? ignore().add(rootCerialIgnore.content) : null;
  const rootExcludeIg = hasPatterns(rootConfig?.exclude) ? buildIgnore(rootConfig.exclude) : null;
  const rootIncludeIg = hasPatterns(rootConfig?.include) ? buildIgnore(rootConfig.include) : null;

  // Schema layer
  const schemaExcludeIg = hasPatterns(schemaConfig?.exclude) ? buildIgnore(schemaConfig.exclude) : null;
  const schemaIncludeIg = hasPatterns(schemaConfig?.include) ? buildIgnore(schemaConfig.include) : null;

  // Folder layer
  const folderCerialIg = folderCerialIgnore ? ignore().add(folderCerialIgnore.content) : null;
  const folderExcludeIg = hasPatterns(folderConfig?.exclude) ? buildIgnore(folderConfig.exclude) : null;
  const folderIncludeIg = hasPatterns(folderConfig?.include) ? buildIgnore(folderConfig.include) : null;

  return {
    shouldInclude(relativePath: string): boolean {
      const normalized = normalizePath(relativePath);
      if (!normalized) return true;

      // Step 1: Absolute blacklist — nothing overrides ignore
      if (absoluteIg?.ignores(normalized)) return false;

      // Step 2: Root .cerialignore (overridable by root include)
      if (rootCerialIg?.ignores(normalized)) {
        if (!rootIncludeIg?.ignores(normalized)) return false;
      }

      // Step 3: Root exclude (overridable by root include)
      if (rootExcludeIg?.ignores(normalized)) {
        if (!rootIncludeIg?.ignores(normalized)) return false;
      }

      // Step 4: Schema exclude (overridable by schema include)
      if (schemaExcludeIg?.ignores(normalized)) {
        if (!schemaIncludeIg?.ignores(normalized)) return false;
      }

      // Step 5: Folder .cerialignore (overridable by folder include)
      if (folderCerialIg?.ignores(normalized)) {
        if (!folderIncludeIg?.ignores(normalized)) return false;
      }

      // Step 6: Folder exclude (overridable by folder include)
      if (folderExcludeIg?.ignores(normalized)) {
        if (!folderIncludeIg?.ignores(normalized)) return false;
      }

      return true;
    },
  };
}
