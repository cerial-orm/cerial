import { pathToFileURL } from 'node:url';
import { describe, expect, test } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Diagnostic, DocumentDiagnosticReport } from 'vscode-languageserver';
import { registerDiagnosticsProvider } from '../../server/src/providers/diagnostics';
import { createConnectionStub } from './connection-stub';
import { createIndexerWithContent, testPath } from './helpers';

type DiagnosticHandler = (params: { textDocument: { uri: string } }) => Promise<DocumentDiagnosticReport>;

/** Run the real diagnostics handler over one document and return its items. */
async function diagnose(source: string): Promise<Diagnostic[]> {
  const indexer = createIndexerWithContent({ 'sort.cerial': source });
  const stub = createConnectionStub([]);
  // The provider registers through connection.languages.diagnostics.on
  let handler: DiagnosticHandler | undefined;
  Object.assign(stub.connection, {
    languages: { diagnostics: { on: (h: DiagnosticHandler) => (handler = h) } },
  });

  const uri = pathToFileURL(testPath('sort.cerial')).href;
  const documents = new Map([[uri, TextDocument.create(uri, 'cerial', 1, source)]]);

  registerDiagnosticsProvider(
    stub.connection,
    documents as never,
    indexer,
    () => ({ diagnostics: { enabled: true } }) as never,
  );

  const report = await handler!({ textDocument: { uri } });

  return 'items' in report ? report.items : [];
}

function schema(decorator: string): string {
  return `model User {\n  id Record @id\n  name String[] ${decorator}\n}\n`;
}

describe('@sort argument diagnostics', () => {
  test('@sort(bogus) yields exactly one diagnostic naming the field and the argument', async () => {
    const items = await diagnose(schema('@sort(bogus)'));

    expect(items.length).toBe(1);
    expect(items[0]!.message).toContain('@sort(bogus)');
    expect(items[0]!.message).toContain("'name'");
    expect(items[0]!.range.start.line).toBe(2);
  });

  for (const decorator of ['@sort', '@sort()', '@sort(true)', '@sort(false)', '@sort(asc)', '@sort(desc)']) {
    test(`${decorator} yields no diagnostics`, async () => {
      expect(await diagnose(schema(decorator))).toEqual([]);
    });
  }
});
