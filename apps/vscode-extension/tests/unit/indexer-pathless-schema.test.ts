import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WorkspaceIndexer } from '../../server/src/indexer';

function project(schemas: Record<string, Record<string, unknown>>): string {
  const root = mkdtempSync(join(tmpdir(), 'cerial-indexer-'));
  mkdirSync(join(root, 'db'));
  writeFileSync(join(root, 'db', 'main.cerial'), 'model Host {\n  id Record @id\n}\n');
  writeFileSync(join(root, 'cerial.config.json'), JSON.stringify({ schemas }));

  return root;
}

function fileUri(root: string): string {
  return pathToFileURL(join(root, 'db', 'main.cerial')).href;
}

describe('a config schema with no path', () => {
  test('an entry-only schema does not stop the scan, and a schema with a path is still indexed', () => {
    const root = project({
      registered: { entry: './cerial.schema.ts', output: './a' },
      plain: { path: './db', output: './b' },
    });

    try {
      const indexer = new WorkspaceIndexer();
      indexer.scanWorkspace([root]);

      expect(indexer.getSchemaGroup(fileUri(root))?.name).toBe('plain');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('a files-only schema makes no group of its own', () => {
    const root = project({ listed: { files: ['./db/main.cerial'], output: './a' } });

    try {
      const indexer = new WorkspaceIndexer();
      indexer.scanWorkspace([root]);

      expect(indexer.getSchemaGroup(fileUri(root))).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
