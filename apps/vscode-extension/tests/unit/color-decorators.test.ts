import { describe, expect, test } from 'bun:test';
import type { ColorInformation, ColorPresentation, TextDocuments } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { registerColorProvider } from '../../server/src/providers/color-decorators';
import { createConnectionStub } from './connection-stub';

const METHODS = ['onDocumentColor', 'onColorPresentation'] as const;

/** The provider ignores its documents argument; an empty object stands in for it. */
function documentsStub(): TextDocuments<TextDocument> {
  return {} as TextDocuments<TextDocument>;
}

function register() {
  const stub = createConnectionStub(METHODS);

  registerColorProvider(stub.connection, documentsStub());

  return stub;
}

describe('Color Provider', () => {
  test('registers exactly one document color handler and one color presentation handler', () => {
    const { handlers } = register();

    expect(handlers.onDocumentColor!.length).toBe(1);
    expect(handlers.onColorPresentation!.length).toBe(1);
  });

  test('document color handler returns an empty array', () => {
    const { handlers } = register();
    const handler = handlers.onDocumentColor![0] as () => ColorInformation[];

    expect(handler()).toEqual([]);
  });

  test('document color handler returns a fresh array on every call', () => {
    const { handlers } = register();
    const handler = handlers.onDocumentColor![0] as () => ColorInformation[];
    const first = handler();

    first.push({
      color: { red: 1, green: 0, blue: 0, alpha: 1 },
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
    });

    expect(handler()).toEqual([]);
  });

  test('document color handler ignores its params, even a document with colour-like text', () => {
    const { handlers } = register();
    const handler = handlers.onDocumentColor![0] as (params: unknown) => ColorInformation[];

    expect(handler({ textDocument: { uri: 'file:///x.cerial' } })).toEqual([]);
    expect(handler(undefined)).toEqual([]);
  });

  test('color presentation handler returns an empty array', () => {
    const { handlers } = register();
    const handler = handlers.onColorPresentation![0] as () => ColorPresentation[];

    expect(handler()).toEqual([]);
  });

  test('color presentation handler returns an empty array for a concrete colour request', () => {
    const { handlers } = register();
    const handler = handlers.onColorPresentation![0] as (params: unknown) => ColorPresentation[];

    expect(
      handler({
        textDocument: { uri: 'file:///x.cerial' },
        color: { red: 1, green: 0, blue: 0, alpha: 1 },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
      }),
    ).toEqual([]);
  });

  test('registering on a connection without the color methods throws', () => {
    const stub = createConnectionStub([]);

    expect(() => registerColorProvider(stub.connection, documentsStub())).toThrow();
  });
});
