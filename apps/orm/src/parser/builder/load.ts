import { CerialGenerationError } from '../../errors';
import { isEnumHandle } from './enum';
import { isLiteralHandle } from './literal';
import type { ExportedDeclaration } from './materialise';
import { isModelHandle } from './model';
import { isObjectHandle } from './object';
import { isTupleHandle } from './tuple';

/** Imports one module and returns its namespace. */
export type ModuleImporter = (path: string) => Promise<Record<string, unknown>>;

export interface LoadOptions {
  /** Replaces the import, so a caller can supply a fresh one. Defaults to {@link importSchemaModule}. */
  readonly importModule?: ModuleImporter;
}

/**
 * The one place a schema module is imported. A `?v=` query would re-evaluate only the module it names, not
 * the modules it imports, so a watcher gets a fresh module graph from a new process instead.
 */
export const importSchemaModule: ModuleImporter = (path) => import(path);

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
  const { importModule = importSchemaModule } = options;
  const declarations: ExportedDeclaration[] = [];

  for (const module of files) {
    let namespace: Record<string, unknown>;
    try {
      namespace = await importModule(module);
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
