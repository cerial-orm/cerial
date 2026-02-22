/**
 * Document formatting provider for .cerial files.
 *
 * Delegates to cerial's `formatCerialSource()` and returns LSP TextEdits.
 * Files with parse errors are left untouched (empty edits returned).
 */

import type { Connection, TextDocuments } from 'vscode-languageserver';
import { Range, TextEdit } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { FormatConfig } from '../../../../src/formatter';
import { formatCerialSource } from '../../../../src/formatter';
import type { CerialSettings } from '../server';

/**
 * Build a cerial `FormatConfig` by merging user settings with VS Code
 * formatting options.
 *
 * User settings take precedence. VS Code's `insertSpaces` / `tabSize`
 * are used as a fallback only when the user hasn't explicitly set
 * `cerial.format.indentSize`.
 */
function buildFormatConfig(
  editorOptions: { tabSize: number; insertSpaces: boolean },
  userConfig: FormatConfig,
): FormatConfig {
  // Start from user settings
  const config: FormatConfig = { ...userConfig };

  // If user hasn't set indentSize, derive from editor options
  if (config.indentSize === undefined) {
    if (!editorOptions.insertSpaces) {
      config.indentSize = 'tab';
    } else {
      config.indentSize = editorOptions.tabSize === 4 ? 4 : 2;
    }
  }

  return config;
}

/**
 * Format the full document text and return a single replacing TextEdit,
 * or an empty array when formatting is unnecessary or impossible.
 */
function formatDocument(
  document: TextDocument,
  options: { tabSize: number; insertSpaces: boolean },
  userConfig: FormatConfig,
): TextEdit[] {
  const source = document.getText();
  const config = buildFormatConfig(options, userConfig);
  const result = formatCerialSource(source, config);

  // Parse error — don't touch the file
  if (result.error) {
    return [];
  }

  // Nothing changed — no edits needed
  if (!result.changed) {
    return [];
  }

  // Replace entire document content
  const lastLine = document.lineCount - 1;
  const lastLineText = document.getText(Range.create(lastLine, 0, lastLine + 1, 0));
  const fullRange = Range.create(0, 0, lastLine, lastLineText.length);

  return [TextEdit.replace(fullRange, result.formatted)];
}

/**
 * Register document formatting handlers on the LSP connection.
 */
export function registerFormattingProvider(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  getSettings: () => CerialSettings,
): void {
  // Full document formatting (Format Document command)
  connection.onDocumentFormatting((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    return formatDocument(document, params.options, getSettings().format);
  });

  // Range formatting — cerial's formatter works on whole files only,
  // so we fall back to full-document formatting.
  connection.onDocumentRangeFormatting((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    return formatDocument(document, params.options, getSettings().format);
  });
}
