import { describe, expect, test } from 'bun:test';
import { WorkspaceIndexer } from '../../server/src/indexer';
import { createIndexerWithContent, loadFixture, testPath } from './helpers';

describe('WorkspaceIndexer', () => {
  describe('indexFile', () => {
    test('indexes a file and produces AST', () => {
      const indexer = new WorkspaceIndexer();
      const content = loadFixture('simple-model.cerial');
      const rootPath = testPath('').slice(0, -1); // remove trailing separator

      // Create a group first so the file has somewhere to go
      indexer.schemaGroups.set('test', {
        name: 'test',
        rootPath,
        files: new Set(),
        config: null,
        externalNames: { objects: new Set(), tuples: new Set(), literals: new Set(), enums: new Set() },
      });

      indexer.indexFile(testPath('simple.cerial'), content, 1);

      const ast = indexer.getAST(testPath('simple.cerial'));

      expect(ast).not.toBeNull();
      expect(ast!.models.length).toBeGreaterThan(0);
    });

    test('standalone file (no group) gets parsed without context', () => {
      const indexer = new WorkspaceIndexer();
      const content = 'model Standalone {\n  id Record @id\n  name String\n}';
      const standalonePath = testPath('../other/standalone.cerial');

      indexer.indexFile(standalonePath, content, 1);

      const ast = indexer.getAST(standalonePath);

      expect(ast).not.toBeNull();
      expect(ast!.models[0]!.name).toBe('Standalone');
    });

    test('re-indexing updates content and version', () => {
      const indexer = createIndexerWithContent({
        'a.cerial': 'model A { id Record @id }',
      });

      // Update the file content
      indexer.indexFile(testPath('a.cerial'), 'model A {\n  id Record @id\n  name String\n}', 2);

      const entry = indexer.index.get(testPath('a.cerial'));

      expect(entry).toBeDefined();
      expect(entry!.version).toBe(2);

      const ast = indexer.getAST(testPath('a.cerial'));
      const nameField = ast!.models[0]!.fields.find((f) => f.name === 'name');

      expect(nameField).toBeDefined();
    });
  });

  describe('schema group creation', () => {
    test('createIndexerWithContent creates a schema group', () => {
      const indexer = createIndexerWithContent({
        'a.cerial': 'model A { id Record @id }',
        'b.cerial': 'model B { id Record @id }',
      });

      expect(indexer.schemaGroups.size).toBe(1);
      expect(indexer.schemaGroups.has('test-group')).toBe(true);

      const group = indexer.schemaGroups.get('test-group')!;

      expect(group.files.size).toBe(2);
    });

    test('files in group are parsed', () => {
      const indexer = createIndexerWithContent({
        'a.cerial': 'model A { id Record @id }',
      });

      const ast = indexer.getAST(testPath('a.cerial'));

      expect(ast).not.toBeNull();
      expect(ast!.models[0]!.name).toBe('A');
    });
  });

  describe('two-pass cross-file parsing', () => {
    test('object type from file A resolves in file B', () => {
      const indexer = createIndexerWithContent({
        'types.cerial': 'object Address {\n  street String\n  city String\n}',
        'models.cerial': 'model User {\n  id Record @id\n  addr Address\n}',
      });

      const modelAST = indexer.getAST(testPath('models.cerial'));

      expect(modelAST).not.toBeNull();

      const addrField = modelAST!.models[0]!.fields.find((f) => f.name === 'addr');

      expect(addrField).toBeDefined();
      expect(addrField!.objectName).toBe('Address');
    });

    test('enum type from file A resolves in file B', () => {
      const indexer = createIndexerWithContent({
        'types.cerial': 'enum Status { ACTIVE, INACTIVE }',
        'models.cerial': 'model User {\n  id Record @id\n  status Status\n}',
      });

      const modelAST = indexer.getAST(testPath('models.cerial'));
      const statusField = modelAST!.models[0]!.fields.find((f) => f.name === 'status');

      expect(statusField).toBeDefined();
      // Enum fields use literalName internally
      expect(statusField!.literalName).toBe('Status');
    });

    test('tuple type resolves cross-file', () => {
      const indexer = createIndexerWithContent({
        'types.cerial': 'tuple Point {\n  Float,\n  Float\n}',
        'models.cerial': 'model Geo {\n  id Record @id\n  location Point\n}',
      });

      const modelAST = indexer.getAST(testPath('models.cerial'));
      const locField = modelAST!.models[0]!.fields.find((f) => f.name === 'location');

      expect(locField).toBeDefined();
      expect(locField!.tupleName).toBe('Point');
    });

    test('literal type resolves cross-file', () => {
      const indexer = createIndexerWithContent({
        'types.cerial': "literal Priority { 'low', 'medium', 'high' }",
        'models.cerial': 'model Task {\n  id Record @id\n  priority Priority\n}',
      });

      const modelAST = indexer.getAST(testPath('models.cerial'));
      const field = modelAST!.models[0]!.fields.find((f) => f.name === 'priority');

      expect(field).toBeDefined();
      expect(field!.literalName).toBe('Priority');
    });
  });

  describe('schema group isolation', () => {
    test('types from different groups do not leak', () => {
      const indexer = new WorkspaceIndexer();
      const path = require('node:path');

      // Create two separate groups with normalized paths
      const g1File = path.normalize('/group1/a.cerial');
      const g2File = path.normalize('/group2/b.cerial');
      const group1Files = new Set([g1File]);
      const group2Files = new Set([g2File]);

      indexer.index.set(g1File, {
        ast: null,
        errors: [],
        version: 1,
        schemaGroup: 'group1',
        content: 'object SharedName {\n  x String\n}',
      });

      indexer.index.set(g2File, {
        ast: null,
        errors: [],
        version: 1,
        schemaGroup: 'group2',
        content: 'model Uses {\n  id Record @id\n  data SharedName\n}',
      });

      indexer.schemaGroups.set('group1', {
        name: 'group1',
        rootPath: path.normalize('/group1'),
        files: group1Files,
        config: null,
        externalNames: { objects: new Set(), tuples: new Set(), literals: new Set(), enums: new Set() },
      });

      indexer.schemaGroups.set('group2', {
        name: 'group2',
        rootPath: path.normalize('/group2'),
        files: group2Files,
        config: null,
        externalNames: { objects: new Set(), tuples: new Set(), literals: new Set(), enums: new Set() },
      });

      indexer.reindexSchemaGroup('group1');
      indexer.reindexSchemaGroup('group2');

      // Group2's model should NOT resolve SharedName since it's in group1
      const ast2 = indexer.getAST(g2File);
      const dataField = ast2!.models[0]!.fields.find((f) => f.name === 'data');

      // Without cross-group resolution, the field either doesn't parse
      // (unknown type) or has no objectName
      if (dataField) {
        expect(dataField.objectName).toBeUndefined();
      } else {
        // Field was dropped by parser due to unknown type — isolation confirmed
        expect(dataField).toBeUndefined();
      }
    });
  });

  describe('getErrors', () => {
    test('returns empty array for valid file', () => {
      const indexer = createIndexerWithContent({
        'valid.cerial': 'model Valid { id Record @id }',
      });

      const errors = indexer.getErrors(testPath('valid.cerial'));

      expect(errors).toEqual([]);
    });

    test('returns errors for invalid file', () => {
      const indexer = createIndexerWithContent({
        'broken.cerial': 'model Broken {\n  id Record @id\n  name Strig\n}',
      });

      const errors = indexer.getErrors(testPath('broken.cerial'));

      // Parse errors for unknown type 'Strig'
      expect(errors.length).toBeGreaterThan(0);
    });

    test('returns empty array for non-indexed file', () => {
      const indexer = new WorkspaceIndexer();
      const errors = indexer.getErrors('/nonexistent.cerial');

      expect(errors).toEqual([]);
    });
  });

  describe('getSchemaGroup', () => {
    test('returns group for file in group', () => {
      const indexer = createIndexerWithContent({
        'a.cerial': 'model A { id Record @id }',
      });

      const group = indexer.getSchemaGroup(testPath('a.cerial'));

      expect(group).not.toBeNull();
      expect(group!.name).toBe('test-group');
    });

    test('returns null for non-indexed file', () => {
      const indexer = new WorkspaceIndexer();

      expect(indexer.getSchemaGroup('/nope.cerial')).toBeNull();
    });
  });

  describe('getAllASTsInGroup', () => {
    test('returns all parsed ASTs in group', () => {
      const indexer = createIndexerWithContent({
        'a.cerial': 'model A { id Record @id }',
        'b.cerial': 'model B { id Record @id }',
      });

      const asts = indexer.getAllASTsInGroup('test-group');

      expect(asts.size).toBe(2);

      for (const [, ast] of asts) {
        expect(ast.models.length).toBe(1);
      }
    });

    test('returns empty map for non-existent group', () => {
      const indexer = new WorkspaceIndexer();
      const asts = indexer.getAllASTsInGroup('nope');

      expect(asts.size).toBe(0);
    });
  });

  describe('getResolvedAST', () => {
    test('merges all ASTs in group', () => {
      const indexer = createIndexerWithContent({
        'a.cerial': 'model A { id Record @id }',
        'b.cerial': 'model B {\n  id Record @id\n  name String\n}',
      });

      const resolved = indexer.getResolvedAST('test-group');

      expect(resolved.models.length).toBe(2);
      const names = resolved.models.map((m) => m.name);

      expect(names).toContain('A');
      expect(names).toContain('B');
    });

    test('resolves inheritance in merged AST', () => {
      const indexer = createIndexerWithContent({
        'base.cerial': 'abstract model Base {\n  id Record @id\n  createdAt Date @createdAt\n}',
        'child.cerial': 'model Child extends Base {\n  name String\n}',
      });

      const resolved = indexer.getResolvedAST('test-group');
      const child = resolved.models.find((m) => m.name === 'Child');

      expect(child).toBeDefined();
      // After inheritance resolution, Child should have inherited fields
      const fieldNames = child!.fields.map((f) => f.name);

      expect(fieldNames).toContain('id');
      expect(fieldNames).toContain('createdAt');
      expect(fieldNames).toContain('name');
    });
  });

  describe('removeFile', () => {
    test('removes file from index and group', () => {
      const indexer = createIndexerWithContent({
        'a.cerial': 'model A { id Record @id }',
        'b.cerial': 'model B { id Record @id }',
      });

      indexer.removeFile(testPath('a.cerial'));

      expect(indexer.index.has(testPath('a.cerial'))).toBe(false);
      expect(indexer.getAST(testPath('a.cerial'))).toBeNull();

      const group = indexer.schemaGroups.get('test-group')!;

      expect(group.files.has(testPath('a.cerial'))).toBe(false);
    });

    test('removing non-existent file is a no-op', () => {
      const indexer = createIndexerWithContent({
        'a.cerial': 'model A { id Record @id }',
      });

      // Should not throw
      indexer.removeFile('/nonexistent.cerial');

      expect(indexer.index.size).toBe(1);
    });
  });

  describe('removeSchemaGroup', () => {
    test('removes group and all its files', () => {
      const indexer = createIndexerWithContent({
        'a.cerial': 'model A { id Record @id }',
        'b.cerial': 'model B { id Record @id }',
      });

      indexer.removeSchemaGroup('test-group');

      expect(indexer.schemaGroups.has('test-group')).toBe(false);
      expect(indexer.index.size).toBe(0);
    });

    test('removing non-existent group is a no-op', () => {
      const indexer = new WorkspaceIndexer();

      indexer.removeSchemaGroup('nope');

      expect(indexer.schemaGroups.size).toBe(0);
    });
  });

  describe('updateContent', () => {
    test('updates content without triggering reindex', () => {
      const indexer = createIndexerWithContent({
        'a.cerial': 'model A { id Record @id }',
      });

      const oldAST = indexer.getAST(testPath('a.cerial'));

      indexer.updateContent(testPath('a.cerial'), 'model A {\n  id Record @id\n  name String\n}', 2);

      // AST should NOT have changed (updateContent doesn't reindex)
      const currentAST = indexer.getAST(testPath('a.cerial'));

      expect(currentAST).toBe(oldAST);

      // But content is updated
      const entry = indexer.index.get(testPath('a.cerial'))!;

      expect(entry.content).toContain('name String');
      expect(entry.version).toBe(2);
    });

    test('updateContent for non-existent file is a no-op', () => {
      const indexer = new WorkspaceIndexer();

      indexer.updateContent('/nonexistent.cerial', 'model X {}', 1);

      expect(indexer.index.size).toBe(0);
    });
  });

  describe('reindexSchemaGroup', () => {
    test('updates externalNames on the group', () => {
      const indexer = createIndexerWithContent({
        'types.cerial': 'object Addr {\n  street String\n}\nenum Role { ADMIN, USER }',
        'model.cerial': 'model M { id Record @id }',
      });

      const group = indexer.schemaGroups.get('test-group')!;

      expect(group.externalNames.objects.has('Addr')).toBe(true);
      expect(group.externalNames.enums.has('Role')).toBe(true);
    });

    test('reindex on non-existent group is a no-op', () => {
      const indexer = new WorkspaceIndexer();

      // Should not throw
      indexer.reindexSchemaGroup('nonexistent');
    });
  });

  describe('multi-file fixtures', () => {
    test('multi-file-a and multi-file-b cross-resolve', () => {
      const indexer = createIndexerWithContent({
        'multi-file-a.cerial': loadFixture('multi-file-a.cerial'),
        'multi-file-b.cerial': loadFixture('multi-file-b.cerial'),
      });

      // File B references Employee from file A
      const bAST = indexer.getAST(testPath('multi-file-b.cerial'));
      const project = bAST!.models.find((m) => m.name === 'Project');

      expect(project).toBeDefined();

      // leadId should be a record field
      const leadId = project!.fields.find((f) => f.name === 'leadId');

      expect(leadId).toBeDefined();
      expect(leadId!.type).toBe('record');

      // lead Relation should have @model(Employee) — the model name should parse correctly
      const lead = project!.fields.find((f) => f.name === 'lead');

      expect(lead).toBeDefined();
      expect(lead!.type).toBe('relation');
    });
  });
});
