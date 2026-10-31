import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CerialGenerationError } from '../../errors';
import { isSchemaRegistration, type SchemaRegistration } from './define-schema';
import { isEnumHandle } from './enum';
import { isLiteralHandle } from './literal';
import type { ExportedDeclaration } from './materialise';
import { isModelHandle } from './model';
import { isObjectHandle } from './object';
import { isTupleHandle } from './tuple';

/** Imports one module and returns its namespace. */
export type ModuleImporter = (path: string) => Promise<Record<string, unknown>>;

/** The modules one module statically imports or re-exports, as absolute paths worth registering. */
export type ImportReader = (file: string) => Promise<readonly string[]>;

export interface LoadOptions {
  /** Replaces the import, so a caller can supply a fresh one. Defaults to {@link importSchemaModule}. */
  readonly importModule?: ModuleImporter;
  /** Replaces the reader of a module's imports. Defaults to {@link readModuleImports}. */
  readonly readImports?: ImportReader;
  /** Modules that must export a `defineSchema` result; one that does not refuses naming its path. */
  readonly entries?: readonly string[];
  /**
   * True for a module the filter cascade excludes. Such a module still runs, because its importer imports it,
   * but contributes nothing: its declarations are not harvested and the walk stops there.
   */
  readonly excludes?: (path: string) => boolean;
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
  esmResolve(id: string, options: { parentURL: string; try: true }): string | undefined;
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

/** Resolve `specifier` as the runtime that imports it does, so `paths` aliases and extensionless names agree. */
async function resolveSpecifier(specifier: string, from: string): Promise<string | undefined> {
  try {
    if (process.versions.bun) return Bun.resolveSync(specifier, dirname(from));

    const resolved = (await loader()).esmResolve(specifier, { parentURL: pathToFileURL(from).href, try: true });
    if (!resolved) return undefined;

    return resolved.startsWith('file:') ? fileURLToPath(resolved) : resolved;
  } catch {
    // The import itself already ran, so an unresolvable name is a type-only artefact, not a missing module
    return undefined;
  }
}

/** A TypeScript source the walk can read: not a declaration file, a dependency, or the generated handles. */
function isWalkable(path: string): boolean {
  const normal = path.replace(/\\/g, '/');
  if (!/\.[cm]?tsx?$/.test(normal) || /\.d\.[cm]?ts$/.test(normal)) return false;
  if (normal.includes('/node_modules/')) return false;

  return !/(^|\/)cerial\/handles\.ts$/.test(normal);
}

type TypeScript = typeof import('typescript');

async function loadTypescript(): Promise<TypeScript> {
  try {
    const module = (await import('typescript')) as TypeScript & { default?: TypeScript };

    return module.default ?? module;
  } catch (error) {
    throw new CerialGenerationError(
      "Following an entry module's imports needs the 'typescript' package, a peer dependency of cerial. Install it with your package manager.",
      { cause: error },
    );
  }
}

/** Specifiers of the value-level static imports and re-exports of `source`; type-only ones and dynamic imports are no edges. */
function staticSpecifiers(ts: TypeScript, file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false);
  const specifiers: string[] = [];
  const allTypeOnly = (elements: readonly { readonly isTypeOnly: boolean }[]): boolean =>
    !!elements.length && elements.every((element) => element.isTypeOnly);

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      if (clause?.isTypeOnly) continue;
      const named = clause?.namedBindings;
      if (!clause?.name && named && ts.isNamedImports(named) && allTypeOnly(named.elements)) continue;
      specifiers.push(statement.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      if (statement.isTypeOnly) continue;
      const clause = statement.exportClause;
      if (clause && ts.isNamedExports(clause) && allTypeOnly(clause.elements)) continue;
      specifiers.push(statement.moduleSpecifier.text);
    }
  }

  return specifiers;
}

/**
 * The modules `file` statically imports or re-exports by value, resolved the way the running import
 * resolves them and limited to TypeScript sources outside `node_modules`. Read with the `typescript` peer.
 */
export const readModuleImports: ImportReader = async (file) => {
  const ts = await loadTypescript();
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    throw new CerialGenerationError(
      `Cannot read ${file} to follow its imports: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  const found = new Set<string>();
  for (const specifier of staticSpecifiers(ts, file, text)) {
    const resolved = await resolveSpecifier(specifier, file);
    if (resolved && isWalkable(resolved)) found.add(resolved);
  }

  return [...found];
};

/**
 * Every TypeScript module reachable from `roots` through static imports and re-exports, as absolute paths,
 * roots included. Only reads imports: nothing is imported or run, so a watcher can call it without taking
 * user modules into its own process. A module `excludes` names is left out and not followed; the reader
 * already skips `node_modules`, declaration files and the generated handles.
 */
export async function moduleGraph(
  roots: readonly string[],
  options: Pick<LoadOptions, 'readImports' | 'excludes'> = {},
): Promise<string[]> {
  const { readImports = readModuleImports, excludes } = options;
  const seen = new Set<string>();
  const queue = roots.filter(isWalkable);
  for (let next = 0; next < queue.length; next++) {
    const module = queue[next]!;
    if (seen.has(module) || excludes?.(module)) continue;
    seen.add(module);
    queue.push(...(await readImports(module)));
  }

  return [...seen];
}

function registrationsOf(namespace: Record<string, unknown>): SchemaRegistration[] {
  return Object.values(namespace).filter(isSchemaRegistration);
}

/**
 * Import each module and collect every export, default included, that a builder declared. Exports that
 * are anything else are ignored, so a module with none is empty rather than an error. A module that
 * throws on import refuses naming its path.
 *
 * A module that exports a `defineSchema` result is an entry: the modules it imports, and theirs in turn,
 * are imported and harvested too, whatever their names. A module without one is not followed. Every model
 * an entry lists must turn up among the harvested exports.
 */
export async function loadDeclarations(
  files: readonly string[],
  options: LoadOptions = {},
): Promise<ExportedDeclaration[]> {
  const { importModule = importSchemaModule, readImports = readModuleImports, entries = [], excludes } = options;
  const excludedHandles = new Set<object>();
  const declarations: ExportedDeclaration[] = [];
  const registered: Array<{ entry: string; registration: SchemaRegistration }> = [];

  async function harvest(module: string): Promise<Record<string, unknown>> {
    let namespace: Record<string, unknown>;
    try {
      namespace = await importModule(module);
    } catch (error) {
      throw new CerialGenerationError(
        `Failed to load schema module ${module}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    const excluded = !!excludes?.(module);
    for (const [exportName, value] of Object.entries(namespace)) {
      if (!isDeclaration(value)) continue;
      if (excluded) excludedHandles.add(value);
      else declarations.push({ handle: value, module, exportName });
    }

    return namespace;
  }

  // Breadth-first, so an entry's own exports come before those of what it imports. A module can be
  // reached twice (listed, then imported by an entry): it is imported once but followed if either says so.
  const queue: Array<{ module: string; followed: boolean }> = files.map((module) => ({ module, followed: false }));
  const entryModules = new Set<string>();
  const seen = new Set<string>();
  const followedModules = new Set<string>();
  for (let next = 0; next < queue.length; next++) {
    const { module, followed } = queue[next]!;

    if (!seen.has(module)) {
      seen.add(module);
      if (excludes?.(module)) {
        await harvest(module);
        continue;
      }
      const registrations = registrationsOf(await harvest(module));
      if (entries.includes(module) && !registrations.length) {
        throw new CerialGenerationError(
          `Schema entry ${module} exports no defineSchema() result. Export one: export default defineSchema({ models: [...] }) from 'cerial/schema'.`,
        );
      }
      if (registrations.length) entryModules.add(module);
      registered.push(...registrations.map((registration) => ({ entry: module, registration })));
    }

    if (!followed && !entryModules.has(module)) continue;
    if (followedModules.has(module)) continue;
    followedModules.add(module);

    for (const imported of await readImports(module)) queue.push({ module: imported, followed: true });
  }

  const harvestedHandles = new Set(declarations.map((d) => d.handle));
  for (const { entry, registration } of registered) {
    for (const handle of registration.models) {
      // Exclusion is the reason it is missing, so it is not refused as unbound
      if (harvestedHandles.has(handle) || excludedHandles.has(handle)) continue;

      throw new CerialGenerationError(
        `${entry}: defineSchema lists model ${handle.name}, but no module the entry imports exports it. Declare it as an exported binding (export const ${handle.name} = model(...)); a model written inline in the list cannot be traced.`,
      );
    }
  }

  return declarations;
}
