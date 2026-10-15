import { describe, expect, test } from 'bun:test';
import { pathToFileURL } from 'node:url';
import { SymbolKind, type WorkspaceSymbol } from 'vscode-languageserver';
import { registerWorkspaceSymbolsProvider } from '../../server/src/providers/workspace-symbols';
import { cerialRangeToLsp } from '../../server/src/utils/position';
import { createConnectionStub } from './connection-stub';
import { createIndexerWithContent, loadFixture, testPath } from './helpers';

const MAX_RESULTS = 100;

type SymbolHandler = (params: { query: string }) => WorkspaceSymbol[];

/** Register the provider against the indexer and return the captured handler. */
function setup(files: Record<string, string>) {
  const indexer = createIndexerWithContent(files);
  const stub = createConnectionStub(['onWorkspaceSymbol']);

  registerWorkspaceSymbolsProvider(stub.connection, indexer);

  const handler = stub.handlers.onWorkspaceSymbol![0] as SymbolHandler;

  return { indexer, search: (query: string) => handler({ query }) };
}

function names(symbols: WorkspaceSymbol[]): string[] {
  return symbols.map((s) => s.name);
}

function manyModels(prefix: string, count: number): string {
  return Array.from({ length: count }, (_, i) => `model ${prefix}${i} {\n  id Record @id\n}`).join('\n');
}

const COMPLEX = loadFixture('complex-types.cerial');
const SIMPLE = loadFixture('simple-model.cerial');

describe('Workspace Symbols', () => {
  test('registers exactly one workspace symbol handler', () => {
    const stub = createConnectionStub(['onWorkspaceSymbol']);

    registerWorkspaceSymbolsProvider(stub.connection, createIndexerWithContent({}));

    expect(stub.handlers.onWorkspaceSymbol!.length).toBe(1);
  });

  describe('well-formed documents', () => {
    test('empty query returns every top-level block of every kind', () => {
      const { search } = setup({ 'complex.cerial': COMPLEX });
      const result = search('');

      expect(names(result)).toContain('Address');
      expect(names(result)).toContain('Point3D');
      expect(names(result)).toContain('Status');
      expect(names(result)).toContain('Severity');
      expect(names(result)).toContain('Profile');
    });

    test('maps each block type to its symbol kind', () => {
      const { search } = setup({ 'complex.cerial': COMPLEX });
      const kindOf = (name: string) => search('').find((s) => s.name === name)!.kind;

      expect(kindOf('Profile')).toBe(SymbolKind.Class);
      expect(kindOf('Address')).toBe(SymbolKind.Struct);
      expect(kindOf('Point3D')).toBe(SymbolKind.Array);
      expect(kindOf('Status')).toBe(SymbolKind.Enum);
      expect(kindOf('Severity')).toBe(SymbolKind.TypeParameter);
    });

    test('orders symbols by block type: models, objects, tuples, enums, literals', () => {
      const { search } = setup({
        'order.cerial': [
          'literal L1 { 1, 2 }',
          'enum E1 { A, B }',
          'tuple T1 {\n  x Int,\n  y Int\n}',
          'object O1 {\n  a String\n}',
          'model M1 {\n  id Record @id\n}',
        ].join('\n'),
      });

      expect(names(search(''))).toEqual(['M1', 'O1', 'T1', 'E1', 'L1']);
    });

    test('excludes fields from the results', () => {
      const { search } = setup({ 'simple.cerial': SIMPLE });

      expect(names(search(''))).toEqual(['User', 'Article']);
      expect(names(search('email'))).toEqual([]);
    });

    test('location uri is the file URL of the indexed path', () => {
      const { search } = setup({ 'simple.cerial': SIMPLE });
      const expected = pathToFileURL(testPath('simple.cerial')).toString();

      for (const symbol of search('')) {
        expect((symbol.location as { uri: string }).uri).toBe(expected);
      }
    });

    test('location range is the AST node range converted to LSP positions', () => {
      const { indexer, search } = setup({ 'simple.cerial': SIMPLE });
      const ast = indexer.index.get(testPath('simple.cerial'))!.ast!;
      const user = ast.models.find((m) => m.name === 'User')!;
      const symbol = search('').find((s) => s.name === 'User')!;

      expect(symbol.location).toEqual({
        uri: pathToFileURL(testPath('simple.cerial')).toString(),
        range: cerialRangeToLsp(user.range),
      });
    });
  });

  describe('query filtering', () => {
    test('matches a substring of the name', () => {
      const { search } = setup({ 'complex.cerial': COMPLEX });

      expect(names(search('ddres'))).toEqual(['Address']);
    });

    test('is case-insensitive in both directions', () => {
      const { search } = setup({ 'complex.cerial': COMPLEX });

      expect(names(search('ADDRESS'))).toEqual(['Address']);
      expect(names(search('address'))).toEqual(['Address']);
    });

    test('returns matches across different kinds', () => {
      const { search } = setup({
        'kinds.cerial': [
          'model Tagged {\n  id Record @id\n}',
          'object TaggedObj {\n  a String\n}',
          'enum TaggedEnum { A, B }',
        ].join('\n'),
      });
      const result = search('tagged');

      expect(names(result)).toEqual(['Tagged', 'TaggedObj', 'TaggedEnum']);
      expect(result.map((s) => s.kind)).toEqual([SymbolKind.Class, SymbolKind.Struct, SymbolKind.Enum]);
    });

    test('returns an empty array when nothing matches', () => {
      const { search } = setup({ 'complex.cerial': COMPLEX });

      expect(search('zzz-no-such-symbol')).toEqual([]);
    });

    test('treats regex metacharacters literally', () => {
      const { search } = setup({ 'complex.cerial': COMPLEX });

      expect(search('.*')).toEqual([]);
      expect(search('(')).toEqual([]);
    });
  });

  describe('multiple files', () => {
    test('collects symbols from every indexed file with each file own uri', () => {
      const { search } = setup({
        'a.cerial': 'model Alpha { id Record @id }',
        'b.cerial': 'model Beta { id Record @id }',
      });
      const result = search('');
      const uriOf = (name: string) => (result.find((s) => s.name === name)!.location as { uri: string }).uri;

      expect(names(result).sort()).toEqual(['Alpha', 'Beta']);
      expect(uriOf('Alpha')).toBe(pathToFileURL(testPath('a.cerial')).toString());
      expect(uriOf('Beta')).toBe(pathToFileURL(testPath('b.cerial')).toString());
    });

    test('the same name in two files yields two symbols', () => {
      const { search } = setup({
        'a.cerial': 'model Dup { id Record @id }',
        'b.cerial': 'model Dup { id Record @id }',
      });

      expect(names(search('dup'))).toEqual(['Dup', 'Dup']);
    });

    test('skips entries whose ast is null and still returns the others', () => {
      const { indexer, search } = setup({ 'good.cerial': 'model Good { id Record @id }' });

      indexer.index.set(testPath('unparsed.cerial'), {
        ast: null,
        errors: [],
        version: 0,
        schemaGroup: 'test-group',
        content: 'model Hidden { id Record @id }',
      });

      expect(names(search(''))).toEqual(['Good']);
    });
  });

  describe('empty and malformed documents', () => {
    test('empty index returns an empty array', () => {
      const { search } = setup({});

      expect(search('')).toEqual([]);
    });

    test('an empty document contributes no symbols', () => {
      const { search } = setup({ 'empty.cerial': '' });

      expect(search('')).toEqual([]);
    });

    test('a comment-only document contributes no symbols', () => {
      const { search } = setup({ 'comments.cerial': '// nothing here\n/* or here */' });

      expect(search('')).toEqual([]);
    });

    test('does not throw on a malformed document and returns what the parser recovered', () => {
      const { search } = setup({ 'incomplete.cerial': loadFixture('incomplete.cerial') });

      expect(() => search('')).not.toThrow();
      expect(Array.isArray(search(''))).toBe(true);
    });
  });

  describe('result limit', () => {
    test('caps a single file at 100 symbols', () => {
      const { search } = setup({ 'big.cerial': manyModels('M', MAX_RESULTS + 50) });

      expect(search('').length).toBe(MAX_RESULTS);
    });

    test('returns all symbols when exactly 100 exist', () => {
      const { search } = setup({ 'exact.cerial': manyModels('M', MAX_RESULTS) });

      expect(search('').length).toBe(MAX_RESULTS);
    });

    test('returns 99 symbols untruncated', () => {
      const { search } = setup({ 'under.cerial': manyModels('M', MAX_RESULTS - 1) });

      expect(search('').length).toBe(MAX_RESULTS - 1);
    });

    test('stops at 100 across files without reading the remaining files', () => {
      const { search } = setup({
        'a.cerial': manyModels('A', 60),
        'b.cerial': manyModels('B', 60),
        'c.cerial': manyModels('C', 60),
      });
      const result = search('');

      expect(result.length).toBe(MAX_RESULTS);
      expect(names(result).some((n) => n.startsWith('C'))).toBe(false);
    });

    test('the limit applies after filtering, so non-matches do not consume it', () => {
      const { search } = setup({
        'big.cerial': `${manyModels('Skip', 120)}\nmodel Target { id Record @id }`,
      });

      expect(names(search('target'))).toEqual(['Target']);
    });
  });
});
