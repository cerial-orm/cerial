/**
 * Workspace Indexer — Central AST cache and workspace manager.
 *
 * Discovers `.cerial` files, groups them by schema, performs two-pass
 * cross-file parsing (collect names → parse with full context), resolves
 * inheritance, and provides AST data to all other LSP providers.
 *
 * Schema groups are strictly isolated — types from group A never leak into group B.
 *
 * IMPORT SAFETY: Imports `parse` and collect*Names from `src/parser/parser.ts`
 * directly (NOT the barrel `src/parser/index.ts` which pulls in Bun APIs).
 * Uses `node:fs` for file I/O (NOT Bun.file()).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CerialConfig } from '../../../orm/src/cli/config/types';
// SAFE: parser.ts imports lexer, tokenizer, string-utils only — no Bun APIs
import {
  collectEnumNames,
  collectLiteralNames,
  collectObjectNames,
  collectTupleNames,
  parse,
} from '../../../orm/src/parser/parser';
// SAFE: resolver barrel has no Bun dependencies
import { resolveInheritance } from '../../../orm/src/resolver';
import type { ParseError, SchemaAST } from '../../../orm/src/types';
import { findCerialFiles, findFolderConfigs, loadCerialConfig, loadFolderConfig } from './config-loader';
import { resolvePathFilter } from '../../../orm/src/cli/filters/path-filter';
import type { PathFilter } from '../../../orm/src/cli/filters/types';
import { NO_FILTER } from '../../../orm/src/cli/filters/types';
import { toFilterPath } from '../../../orm/src/cli/filters/path-utils';
import { loadCerialIgnoreSync } from './filters';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

/** Indexed state for a single .cerial file */
export interface IndexEntry {
  /** Parsed AST (null if not yet parsed or parse failed entirely) */
  ast: SchemaAST | null;
  /** Parse errors from the most recent parse */
  errors: ParseError[];
  /** Document version (from TextDocument sync, 0 for disk-read files) */
  version: number;
  /** Name of the schema group this file belongs to (empty string if standalone) */
  schemaGroup: string;
  /** Last known file content (used for re-parsing during group reindex) */
  content: string;
}

/** A group of .cerial files that share a type namespace */
export interface SchemaGroup {
  /** Group name (from config key, or derived from directory name) */
  name: string;
  /** Absolute root path of the schema directory */
  rootPath: string;
  /** Set of normalized file paths belonging to this group */
  files: Set<string>;
  /** Config associated with this group (null if no config file found) */
  config: CerialConfig | null;
  /** Collected type names from all files in this group (updated on each reindex) */
  externalNames: {
    objects: Set<string>;
    tuples: Set<string>;
    literals: Set<string>;
    enums: Set<string>;
  };
}

// ──────────────────────────────────────────────
// Path Utilities
// ──────────────────────────────────────────────

/**
 * Normalize a file path for consistent Map key comparison.
 * - Resolves `.` and `..` segments
 * - Normalizes path separators
 * - Lowercases Windows drive letter (C: → c:)
 */
function normalizePath(filePath: string): string {
  const normalized = path.normalize(filePath);
  // Normalize Windows drive letter to lowercase
  if (/^[A-Z]:/.test(normalized)) {
    return normalized[0]!.toLowerCase() + normalized.slice(1);
  }

  return normalized;
}

/**
 * Convert a URI or file path to a normalized file path.
 * Handles both `file:///...` URIs and plain filesystem paths.
 */
function toFilePath(uriOrPath: string): string {
  try {
    if (uriOrPath.startsWith('file://')) {
      return normalizePath(fileURLToPath(uriOrPath));
    }
  } catch {
    // Invalid URI — treat as path
  }

  return normalizePath(uriOrPath);
}

// ──────────────────────────────────────────────
// WorkspaceIndexer
// ──────────────────────────────────────────────

export class WorkspaceIndexer {
  /** Per-file index: normalized file path → IndexEntry */
  readonly index = new Map<string, IndexEntry>();

  /** Schema group registry: group name → SchemaGroup */
  readonly schemaGroups = new Map<string, SchemaGroup>();

  // ── Workspace Scanning ──────────────────────

  /**
   * Discover all `.cerial` files in the workspace, detect config files
   * for multi-schema grouping, and perform initial parsing.
   *
   * Clears any previous indexer state. Call once during server initialization,
   * and again if config files change.
   *
   * @param folders - Workspace folder paths (or `file://` URIs)
   */
  scanWorkspace(folders: string[]): void {
    this.index.clear();
    this.schemaGroups.clear();

    for (const folder of folders) {
      const folderPath = toFilePath(folder);
      const config = loadCerialConfig(folderPath);
      // Load root .cerialignore
      const rootCerialIgnore = loadCerialIgnoreSync(folderPath) ?? undefined;
      if (config?.schemas) {
        // Multi-schema mode: one group per schema entry
        for (const [name, schemaEntry] of Object.entries(config.schemas)) {
          const schemaPath = path.resolve(folderPath, schemaEntry.path);
          const folderCerialIgnore = loadCerialIgnoreSync(schemaPath) ?? undefined;
          const fc = loadFolderConfig(schemaPath);

          const filter = resolvePathFilter({
            rootConfig: config,
            schemaConfig: schemaEntry,
            folderConfig: fc ?? undefined,
            rootCerialIgnore,
            folderCerialIgnore,
            basePath: schemaPath,
          });

          this.addGroup(name, schemaPath, config, filter);
        }
      } else if (config?.schema) {
        // Single schema mode
        const schemaPath = path.resolve(folderPath, config.schema);
        const folderCerialIgnore = loadCerialIgnoreSync(schemaPath) ?? undefined;
        const fc = loadFolderConfig(schemaPath);

        const filter = resolvePathFilter({
          rootConfig: config,
          folderConfig: fc ?? undefined,
          rootCerialIgnore,
          folderCerialIgnore,
          basePath: schemaPath,
        });

        this.addGroup(path.basename(schemaPath), schemaPath, config, filter);
      } else {
        // No root config schemas/schema — check for folder configs
        const folderConfigs = findFolderConfigs(folderPath);
        const coveredDirs = new Set<string>();

        if (folderConfigs.length) {
          for (const { dir, config: fc } of folderConfigs) {
            const folderCerialIgnore = loadCerialIgnoreSync(dir) ?? undefined;

            const filter = resolvePathFilter({
              rootConfig: config ?? undefined,
              folderConfig: fc,
              rootCerialIgnore,
              folderCerialIgnore,
              basePath: dir,
            });

            const name = fc.name ?? path.basename(dir);
            this.addGroup(name, dir, config, filter);
            coveredDirs.add(normalizePath(dir));
          }
        }

        // Convention/flat fallback for files NOT covered by folder configs
        const allFiles = findCerialFiles(folderPath);
        const uncoveredFiles = allFiles.filter(f => {
          const normalized = normalizePath(f);
          for (const covered of coveredDirs) {
            if (normalized.startsWith(covered + '/')) return false;
          }

          return true;
        });

        if (uncoveredFiles.length) {
          const filter = resolvePathFilter({
            rootConfig: config ?? undefined,
            rootCerialIgnore,
            basePath: folderPath,
          });

          const filteredFiles = uncoveredFiles.filter(f => {
            const relativePath = toFilterPath(f, folderPath);

            return filter.shouldInclude(relativePath);
          });

          if (filteredFiles.length) {
            this.addGroupWithFiles(path.basename(folderPath), folderPath, filteredFiles, config);
          }
        }
      }
    }

    // Initial parse of all groups
    for (const groupName of this.schemaGroups.keys()) {
      this.reindexSchemaGroup(groupName);
    }
  }

  // ── Config-Aware Reload ──────────────────────

  /**
   * Reload config and re-scan workspace, returning a diff of schema groups.
   *
   * Saves the current schema group state, re-scans, then compares to identify
   * added and removed groups. If config loading fails (malformed JSON/TS),
   * the previous state is retained and the error is re-thrown for the caller
   * to handle (e.g., log a warning).
   *
   * @param folders - Workspace folder paths (or `file://` URIs)
   * @returns Diff of added/removed schema group names
   * @throws If scanWorkspace fails — caller should catch and keep previous state
   */
  reloadConfig(folders: string[]): { added: string[]; removed: string[] } {
    const previousGroups = new Set(this.schemaGroups.keys());

    // Snapshot current state so we can restore on failure
    const prevIndex = new Map(this.index);
    const prevSchemaGroups = new Map(this.schemaGroups);

    try {
      this.scanWorkspace(folders);
    } catch (err) {
      // Restore previous state on failure
      this.index.clear();
      for (const [k, v] of prevIndex) this.index.set(k, v);
      this.schemaGroups.clear();
      for (const [k, v] of prevSchemaGroups) this.schemaGroups.set(k, v);
      throw err;
    }

    const currentGroups = new Set(this.schemaGroups.keys());

    const added: string[] = [];
    const removed: string[] = [];

    for (const name of currentGroups) {
      if (!previousGroups.has(name)) added.push(name);
    }
    for (const name of previousGroups) {
      if (!currentGroups.has(name)) removed.push(name);
    }

    return { added, removed };
  }

  /**
   * Remove a schema group and all its files from the index.
   *
   * Does NOT trigger reindexing of remaining groups.
   */
  removeSchemaGroup(groupName: string): void {
    const group = this.schemaGroups.get(groupName);
    if (!group) return;

    for (const filePath of group.files) {
      this.index.delete(filePath);
    }
    this.schemaGroups.delete(groupName);
  }

  // ── File Indexing ───────────────────────────

  /**
   * Index a single file with two-pass parsing.
   *
   * Updates stored content and version, then re-parses the entire schema group
   * (since name changes in one file can affect parsing of other files in the group).
   *
   * @param uri - File URI (`file://...`) or normalized file path
   * @param content - Current file content
   * @param version - Document version (from TextDocument sync)
   */
  indexFile(uri: string, content: string, version: number): void {
    const filePath = toFilePath(uri);
    const existing = this.index.get(filePath);

    if (existing) {
      // Update existing entry
      existing.content = content;
      existing.version = version;

      if (existing.schemaGroup) {
        // Re-parse entire group (names in this file may have changed)
        this.reindexSchemaGroup(existing.schemaGroup);
      } else {
        // Standalone file — parse without cross-file context
        const result = parse(content);
        existing.ast = result.ast;
        existing.errors = result.errors;
      }

      return;
    }

    // New file — find which group it belongs to
    const groupName = this.findGroupForFile(filePath);

    this.index.set(filePath, {
      ast: null,
      errors: [],
      version,
      schemaGroup: groupName ?? '',
      content,
    });

    if (groupName) {
      const group = this.schemaGroups.get(groupName);
      if (group) {
        group.files.add(filePath);
        this.reindexSchemaGroup(groupName);
      }
    } else {
      // Standalone file — parse alone
      const entry = this.index.get(filePath)!;
      const result = parse(content);
      entry.ast = result.ast;
      entry.errors = result.errors;
    }
  }

  /**
   * Update stored content without triggering a reindex.
   * Used for batch content updates (e.g., after workspace rescan with open documents).
   * Call `reindexSchemaGroup()` manually after all updates.
   */
  updateContent(uri: string, content: string, version: number): void {
    const filePath = toFilePath(uri);
    const entry = this.index.get(filePath);
    if (entry) {
      entry.content = content;
      entry.version = version;
    }
  }

  // ── Group Reindexing ────────────────────────

  /**
   * Re-parse ALL files in a schema group with two-pass name resolution.
   *
   * Pass 1: Collect all type names (objects, tuples, literals, enums) from every file.
   * Pass 2: Parse each file with the merged name context from all files in the group.
   *
   * This ensures cross-file type references resolve correctly.
   */
  reindexSchemaGroup(groupName: string): void {
    const group = this.schemaGroups.get(groupName);
    if (!group) return;

    // First pass: collect all type names across all files in the group
    const allObjects = new Set<string>();
    const allTuples = new Set<string>();
    const allLiterals = new Set<string>();
    const allEnums = new Set<string>();

    for (const filePath of group.files) {
      const entry = this.index.get(filePath);
      if (!entry) continue;

      for (const n of collectObjectNames(entry.content)) allObjects.add(n);
      for (const n of collectTupleNames(entry.content)) allTuples.add(n);
      for (const n of collectLiteralNames(entry.content)) allLiterals.add(n);
      for (const n of collectEnumNames(entry.content)) allEnums.add(n);
    }

    // Update group's external names cache
    group.externalNames = {
      objects: allObjects,
      tuples: allTuples,
      literals: allLiterals,
      enums: allEnums,
    };

    // Second pass: parse each file with full cross-file name context
    for (const filePath of group.files) {
      const entry = this.index.get(filePath);
      if (!entry) continue;

      const result = parse(entry.content, allObjects, allTuples, allLiterals, allEnums);
      entry.ast = result.ast;
      entry.errors = result.errors;
    }
  }

  // ── File Removal ────────────────────────────

  /**
   * Remove a file from the index and its schema group.
   * Triggers a group reindex since removed names may affect other files.
   */
  removeFile(uri: string): void {
    const filePath = toFilePath(uri);
    const entry = this.index.get(filePath);
    if (!entry) return;

    const groupName = entry.schemaGroup;
    this.index.delete(filePath);

    if (groupName) {
      const group = this.schemaGroups.get(groupName);
      if (group) {
        group.files.delete(filePath);
        this.reindexSchemaGroup(groupName);
      }
    }
  }

  // ── Getters ─────────────────────────────────

  /** Get the parsed AST for a file, or null if not indexed / parse failed. */
  getAST(uri: string): SchemaAST | null {
    return this.index.get(toFilePath(uri))?.ast ?? null;
  }

  /** Get parse errors for a file (empty array if no errors or not indexed). */
  getErrors(uri: string): ParseError[] {
    return this.index.get(toFilePath(uri))?.errors ?? [];
  }

  /** Get the schema group a file belongs to, or null if standalone / not indexed. */
  getSchemaGroup(uri: string): SchemaGroup | null {
    const entry = this.index.get(toFilePath(uri));
    if (!entry?.schemaGroup) return null;

    return this.schemaGroups.get(entry.schemaGroup) ?? null;
  }

  /** Get all parsed ASTs in a schema group, keyed by normalized file path. */
  getAllASTsInGroup(groupName: string): Map<string, SchemaAST> {
    const group = this.schemaGroups.get(groupName);
    if (!group) return new Map();

    const result = new Map<string, SchemaAST>();
    for (const filePath of group.files) {
      const entry = this.index.get(filePath);
      if (entry?.ast) {
        result.set(filePath, entry.ast);
      }
    }

    return result;
  }

  /**
   * Get a fully resolved AST for a schema group.
   *
   * Merges all file ASTs into one combined AST, then runs inheritance
   * resolution to flatten extends chains. The result has no extends
   * references — all types are fully expanded.
   */
  getResolvedAST(groupName: string): SchemaAST {
    const asts = this.getAllASTsInGroup(groupName);

    const merged: SchemaAST = {
      models: [],
      objects: [],
      tuples: [],
      literals: [],
      enums: [],
      source: '',
    };

    for (const ast of asts.values()) {
      merged.models.push(...ast.models);
      merged.objects.push(...ast.objects);
      merged.tuples.push(...ast.tuples);
      merged.literals.push(...ast.literals);
      merged.enums.push(...ast.enums);
    }

    return resolveInheritance(merged);
  }

  // ── Private Helpers ─────────────────────────

  /**
   * Create a schema group from a directory path.
   * Discovers .cerial files in the directory (or handles a single file path).
   */
  private addGroup(name: string, schemaPath: string, config: CerialConfig | null, filter: PathFilter = NO_FILTER): void {
    const resolvedPath = normalizePath(schemaPath);

    let files: string[];
    try {
      const stat = fs.statSync(resolvedPath);
      if (stat.isFile()) {
        // Single schema file
        files = resolvedPath.endsWith('.cerial') ? [resolvedPath] : [];
      } else {
        files = findCerialFiles(resolvedPath, filter);
      }
    } catch {
      // Path doesn't exist — empty group
      files = [];
    }

    this.addGroupWithFiles(name, resolvedPath, files, config);
  }

  /**
   * Create a schema group with an explicit list of file paths.
   * Reads each file from disk and creates initial index entries.
   */
  private addGroupWithFiles(name: string, rootPath: string, filePaths: string[], config: CerialConfig | null): void {
    const normalizedRoot = normalizePath(rootPath);
    const normalizedFiles = new Set<string>();

    for (const fp of filePaths) {
      const normalized = normalizePath(fp);
      normalizedFiles.add(normalized);

      // Read content from disk and create initial index entry
      try {
        const content = fs.readFileSync(fp, 'utf-8');
        this.index.set(normalized, {
          ast: null,
          errors: [],
          version: 0,
          schemaGroup: name,
          content,
        });
      } catch {
        // Can't read file — skip (will be picked up on next change event)
      }
    }

    this.schemaGroups.set(name, {
      name,
      rootPath: normalizedRoot,
      files: normalizedFiles,
      config,
      externalNames: {
        objects: new Set(),
        tuples: new Set(),
        literals: new Set(),
        enums: new Set(),
      },
    });
  }

  /**
   * Find the best-matching schema group for a file path.
   * Returns the group whose rootPath is the longest prefix of the file path,
   * or null if no group matches.
   */
  private findGroupForFile(filePath: string): string | null {
    let bestMatch: string | null = null;
    let bestLength = 0;

    for (const [groupName, group] of this.schemaGroups) {
      // Ensure we match a full directory boundary, not a partial path
      const rootWithSep = group.rootPath.endsWith(path.sep) ? group.rootPath : group.rootPath + path.sep;

      if (filePath.startsWith(rootWithSep) && group.rootPath.length > bestLength) {
        bestMatch = groupName;
        bestLength = group.rootPath.length;
      }
    }

    return bestMatch;
  }
}
