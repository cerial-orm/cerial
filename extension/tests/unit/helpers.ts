/**
 * Shared test helpers for extension unit tests.
 *
 * Provides fixture loading and indexer creation utilities.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from '../../../src/parser/parser';
import type { SchemaAST } from '../../../src/types';
import { WorkspaceIndexer } from '../../server/src/indexer';

/** Absolute path to the fixtures directory */
const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures');

/** Root path for fake test files, normalized for the current OS */
const TEST_ROOT = path.normalize('/test/schemas');

/**
 * Build a normalized test file path from a filename.
 * Ensures consistent path separators across Windows and Unix.
 */
export function testPath(filename: string): string {
  return path.normalize(`${TEST_ROOT}${path.sep}${filename}`);
}

/**
 * Load a fixture file by name and return its content.
 */
export function loadFixture(name: string): string {
  const filePath = path.join(FIXTURES_DIR, name);

  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Parse a fixture file and return the AST.
 * Optionally pass external type names for cross-file resolution.
 */
export function parseFixture(
  name: string,
  externalObjects?: Set<string>,
  externalTuples?: Set<string>,
  externalLiterals?: Set<string>,
  externalEnums?: Set<string>,
): SchemaAST {
  const content = loadFixture(name);
  const result = parse(content, externalObjects, externalTuples, externalLiterals, externalEnums);

  return result.ast;
}

/**
 * Create a WorkspaceIndexer with injected content for testing.
 * No disk reads needed — all content is provided inline.
 *
 * Files are keyed by normalized paths (OS-aware separators).
 * A single schema group is created containing all files.
 *
 * @param files Record of filename → content
 * @param groupName Optional schema group name (default: 'test-group')
 */
export function createIndexerWithContent(files: Record<string, string>, groupName = 'test-group'): WorkspaceIndexer {
  const indexer = new WorkspaceIndexer();

  // Create a fake schema group with normalized paths
  const normalizedFiles = new Set<string>();

  for (const [filename, content] of Object.entries(files)) {
    const filePath = testPath(filename);
    normalizedFiles.add(filePath);
    indexer.index.set(filePath, {
      ast: null,
      errors: [],
      version: 1,
      schemaGroup: groupName,
      content,
    });
  }

  indexer.schemaGroups.set(groupName, {
    name: groupName,
    rootPath: TEST_ROOT,
    files: normalizedFiles,
    config: null,
    externalNames: {
      objects: new Set(),
      tuples: new Set(),
      literals: new Set(),
      enums: new Set(),
    },
  });

  // Trigger two-pass reindex
  indexer.reindexSchemaGroup(groupName);

  return indexer;
}
