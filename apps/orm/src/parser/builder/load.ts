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

/** The oldest Node release the TypeScript loader supports: the first 22.x with unflagged `require(esm)`. */
export const MINIMUM_NODE_VERSION = '22.12.0';

function atLeast(version: string, minimum: string): boolean {
  const have = version.split('.').map(Number);
  const need = minimum.split('.').map(Number);
  for (let i = 0; i < need.length; i++) {
    const a = have[i] ?? 0;
    if (a !== need[i]) return a > need[i]!;
  }

  return true;
}

/** Refuses a Node below the supported range with the release to upgrade to, before any `.ts` import fails obscurely. */
export function assertSupportedNode(version: string = process.versions.node): void {
  if (atLeast(version, MINIMUM_NODE_VERSION)) return;

  throw new CerialGenerationError(
    `Loading TypeScript schemas and config needs Node ${MINIMUM_NODE_VERSION} or newer (Node 22 LTS); this is Node ${version}. Upgrade to Node 22 LTS, or run cerial with Bun.`,
  );
}

interface Jiti {
  import(id: string): Promise<unknown>;
}
let jiti: Promise<Jiti> | undefined;

// Node strips types natively only from 22.18, and then rejects extensionless relative imports and
// enums, which TypeScript schemas use, so Node goes through jiti. The module cache stays on: a module
// reached from two files must be one instance, or its handles would not compare equal.
function loader(): Promise<Jiti> {
  jiti ??= import('jiti').then(({ createJiti }) => createJiti(`${process.cwd()}/`, { fsCache: false }));

  return jiti;
}

/**
 * The one place a schema or config module is imported, under Bun natively and under Node through jiti.
 * A `?v=` query would re-evaluate only the module it names, not the modules it imports, so a watcher gets
 * a fresh module graph from a new process instead.
 */
export const importSchemaModule: ModuleImporter = async (path) => {
  if (process.versions.bun) return import(path);

  assertSupportedNode();
  const namespace = await (await loader()).import(path);

  return namespace as Record<string, unknown>;
};

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
