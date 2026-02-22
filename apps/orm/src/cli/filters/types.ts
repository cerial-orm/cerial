/**
 * Filter types for path inclusion/exclusion logic
 */

/**
 * Interface for filtering file paths
 */
export interface PathFilter {
  /**
   * Determines if a relative path should be included
   * @param relativePath - Path relative to the base directory
   * @returns true if the path should be included, false otherwise
   */
  shouldInclude(relativePath: string): boolean;
}

/**
 * Configuration for filtering paths
 */
export interface FilterConfig {
  /** Patterns to ignore */
  ignore?: string[];
  /** Patterns to exclude */
  exclude?: string[];
  /** Patterns to include */
  include?: string[];
}

/**
 * Represents a .cerialignore file
 */
export interface CerialIgnoreFile {
  /** Absolute path to the .cerialignore file */
  path: string;
  /** Directory the .cerialignore is relative to */
  dir: string;
  /** Raw content of the file */
  content: string;
}

/**
 * Options for creating a PathFilter
 */
export interface PathFilterOptions {
  /** Root-level filter configuration */
  rootConfig?: FilterConfig;
  /** Schema-level filter configuration */
  schemaConfig?: FilterConfig;
  /** Folder-level filter configuration */
  folderConfig?: FilterConfig;
  /** Root-level .cerialignore file */
  rootCerialIgnore?: CerialIgnoreFile;
  /** Folder-level .cerialignore file */
  folderCerialIgnore?: CerialIgnoreFile;
  /** Base path for relative path resolution */
  basePath: string;
  /** Schema path (optional) */
  schemaPath?: string;
}

/**
 * No-op filter that includes all paths
 */
export const NO_FILTER: PathFilter = {
  shouldInclude: () => true,
};
