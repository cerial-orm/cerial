/**
 * Color Provider for .cerial files.
 *
 * This is a stub implementation that registers the color provider capability
 * but returns empty arrays. .cerial files do not have color literals or color
 * values to highlight. The main color experience comes from semantic tokens
 * (T22) and TextMate grammar (T4) working with the user's color theme.
 */

import type { ColorInformation, ColorPresentation, Connection, TextDocuments } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Register the color provider on the LSP connection.
 *
 * Provides two handlers:
 * - onDocumentColor: Returns color information for colors in the document (empty for .cerial)
 * - onColorPresentation: Returns color presentation options (empty for .cerial)
 */
export function registerColorProvider(connection: Connection, _documents: TextDocuments<TextDocument>): void {
  // Document color handler — returns color information found in the document
  connection.onDocumentColor((): ColorInformation[] => {
    // .cerial files have no color literals, so return empty array
    return [];
  });

  // Color presentation handler — returns presentation options for a color
  connection.onColorPresentation((): ColorPresentation[] => {
    // .cerial files have no color values to present, so return empty array
    return [];
  });
}
