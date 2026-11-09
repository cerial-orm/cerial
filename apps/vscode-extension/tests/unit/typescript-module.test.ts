import { pathToFileURL } from 'node:url';
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { DocumentDiagnosticReport } from 'vscode-languageserver';
import { registerDiagnosticsProvider } from '../../server/src/providers/diagnostics';
import { createConnectionStub } from './connection-stub';
import { createIndexerWithContent, testPath } from './helpers';

type DiagnosticHandler = (params: { textDocument: { uri: string } }) => Promise<DocumentDiagnosticReport>;

const TS_MODULE = `import { model } from 'cerial';\nexport const User = model('User', { id: 'oops' });\n`;
const BAD_CERIAL = 'model User {\n  id Record @id\n  name Strng\n';

async function diagnose(name: string, source: string, indexed: Record<string, string>) {
  const indexer = createIndexerWithContent(indexed);
  const stub = createConnectionStub([]);
  let handler: DiagnosticHandler | undefined;
  Object.assign(stub.connection, {
    languages: { diagnostics: { on: (h: DiagnosticHandler) => (handler = h) } },
  });
  const uri = pathToFileURL(testPath(name)).href;
  const documents = new Map([
    [uri, TextDocument.create(uri, name.endsWith('.ts') ? 'typescript' : 'cerial', 1, source)],
  ]);
  registerDiagnosticsProvider(
    stub.connection,
    documents as never,
    indexer,
    () => ({ diagnostics: { enabled: true } }) as never,
  );
  const report = await handler!({ textDocument: { uri } });

  return 'items' in report ? report.items : [];
}

describe('TypeScript schema modules', () => {
  test('a .ts module beside .cerial files gets no diagnostics', async () => {
    const items = await diagnose('schema.ts', TS_MODULE, { 'schema.ts': TS_MODULE, 'bad.cerial': BAD_CERIAL });

    expect(items).toEqual([]);
  });

  test('a .ts module the indexer never saw gets no diagnostics', async () => {
    expect(await diagnose('schema.ts', TS_MODULE, {})).toEqual([]);
  });

  test('the same handler still reports errors on a malformed .cerial file', async () => {
    const items = await diagnose('bad.cerial', BAD_CERIAL, { 'bad.cerial': BAD_CERIAL });

    expect(items.length).toBeGreaterThan(0);
  });

  test('the extension only claims the .cerial extension', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8')) as {
      contributes: { languages: { id: string; extensions: string[] }[] };
    };
    const cerial = pkg.contributes.languages.find((l) => l.id === 'cerial');

    expect(cerial?.extensions).toEqual(['.cerial']);
  });
});
