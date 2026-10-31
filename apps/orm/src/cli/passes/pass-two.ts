import { handleExportNames, handlesPath } from '../../generators/handles';
import type { ExportedDeclaration, LoadOptions } from '../../parser/builder';
import { loadDeclarations } from '../../parser/builder';
import type { SchemaAST } from '../../types';

export interface PassTwoOptions extends Pick<LoadOptions, 'entries' | 'excludes' | 'importModule' | 'readImports'> {
  /** Set when pass 1 wrote handles: a module importing a name they no longer export is refused */
  readonly handles?: { readonly root: string; readonly ast: SchemaAST };
}

/** Import the TypeScript schema modules and collect what they declare, with the existing module loader */
export function runPassTwo(files: readonly string[], options: PassTwoOptions = {}): Promise<ExportedDeclaration[]> {
  const { handles, ...load } = options;

  return loadDeclarations(files, {
    ...load,
    handles: handles && { path: handlesPath(handles.root), exports: handleExportNames(handles.ast) },
  });
}
