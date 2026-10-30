import { CerialGenerationError } from '../../errors';
import { isEnumHandle } from './enum';
import { isLiteralHandle } from './literal';
import type { ExportedDeclaration } from './materialise';
import { isModelHandle } from './model';
import { isObjectHandle } from './object';
import { isTupleHandle } from './tuple';

/** Imports one module and returns its namespace. A token makes the import see the file as it is now. */
export type ModuleImporter = (path: string, cacheBust?: string) => Promise<Record<string, unknown>>;

export interface LoadOptions {
  /** Replaces the import, so a caller can supply a fresh one. Defaults to {@link importSchemaModule}. */
  readonly importModule?: ModuleImporter;
  /** Passed to every import; a changed value forces the runtime to re-evaluate the module. */
  readonly cacheBust?: string;
}

/** The one place a schema module is imported. The query string gives a re-import a new module identity. */
export const importSchemaModule: ModuleImporter = (path, cacheBust) =>
  import(cacheBust ? `${path}?v=${encodeURIComponent(cacheBust)}` : path);

function isDeclaration(value: unknown): value is object {
  if (typeof value !== 'object' || value === null) return false;

  return (
    isModelHandle(value) ||
    isObjectHandle(value) ||
    isTupleHandle(value) ||
    isLiteralHandle(value) ||
    isEnumHandle(value)
  );
}

/**
 * Import each module and collect every export, default included, that a builder declared. Exports that
 * are anything else are ignored, so a module with none is empty rather than an error. A module that
 * throws on import refuses naming its path.
 */
export async function loadDeclarations(
  files: readonly string[],
  options: LoadOptions = {},
): Promise<ExportedDeclaration[]> {
  const { importModule = importSchemaModule, cacheBust } = options;
  const declarations: ExportedDeclaration[] = [];

  for (const module of files) {
    let namespace: Record<string, unknown>;
    try {
      namespace = await importModule(module, cacheBust);
    } catch (error) {
      throw new CerialGenerationError(
        `Failed to load schema module ${module}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    for (const [exportName, value] of Object.entries(namespace)) {
      if (isDeclaration(value)) declarations.push({ handle: value, module, exportName });
    }
  }

  return declarations;
}
