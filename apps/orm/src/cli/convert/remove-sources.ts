import { existsSync, realpathSync } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleGraph, readModuleImports } from '../../parser/builder/load';
import type { PlannedOutput } from './output-paths';

/** One config entry and everything it reads, so a file two entries read can be told from one only this run owns. */
export interface SourceClaim {
  readonly name: string | undefined;
  /** Every schema file the entry resolved, `.cerial` and TypeScript. */
  readonly sources: readonly string[];
  /** The config values that name a file directly: `files`, `path` and `entry`. */
  readonly listed: readonly { readonly key: 'files' | 'path' | 'entry'; readonly file: string }[];
}

export interface ConvertedSources {
  /** Every file of the converted form this run read: `.cerial` for `--to ts`, TypeScript modules for `--to cerial`. */
  readonly inputs: readonly string[];
  /** The files that emitted a declaration, each with the module that replaces it. */
  readonly outputs: readonly PlannedOutput[];
  /** Targets the commit wrote; empty for a dry run. */
  readonly written: readonly string[];
  readonly claims: readonly SourceClaim[];
  /** Inputs the caller already decided to keep, each with why. */
  readonly blocked?: ReadonlyMap<string, string>;
  /** The value imports of each TypeScript module in the graph. A module a kept one imports is kept too. */
  readonly imports?: ReadonlyMap<string, readonly string[]>;
  /** Modules holding only imports, re-exports and `defineSchema`: removed once everything they import is. */
  readonly pure?: ReadonlySet<string>;
}

export interface RemoveSourcesOptions {
  readonly dryRun?: boolean;
  /** Replaces the deletion so a failure can be injected. */
  readonly remove?: (path: string) => Promise<void>;
}

export interface RemovalReport {
  readonly removed: readonly string[];
  readonly kept: readonly string[];
  readonly failed: readonly string[];
  /** What to print, in order. */
  readonly lines: readonly string[];
}

/** The path a file really is, for comparison only; a missing file compares by its resolved path. */
function real(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/** A linked install resolves `cerial/schema` into this package, whose sources are the library, not a schema. */
function ownSources(): string[] {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, 'package.json')) && dirname(dir) !== dir) dir = dirname(dir);

  return [join(dir, 'src') + sep, join(dir, 'dist') + sep];
}

/** Each module reachable from `roots` with the modules it imports or re-exports. */
export async function moduleEdges(roots: readonly string[]): Promise<Map<string, readonly string[]>> {
  const own = ownSources();
  const excludes = (path: string): boolean => own.some((root) => path.startsWith(root));
  const edges = new Map<string, readonly string[]>();
  for (const module of await moduleGraph(roots, { excludes }))
    edges.set(
      module,
      (await readModuleImports(module)).filter((dep) => !excludes(dep)),
    );

  return edges;
}

/** The files among `files` that hold only imports, re-exports and a `defineSchema` call, with at least one of them. */
export async function pureModules(files: readonly string[]): Promise<Set<string>> {
  const imported = (await import('typescript')) as typeof import('typescript') & {
    default?: typeof import('typescript');
  };
  const ts = imported.default ?? imported;
  const registers = (node: import('typescript').Expression | undefined): boolean =>
    !!node && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'defineSchema';

  const pure = new Set<string>();
  for (const file of files) {
    const { statements } = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const allowed = statements.every((statement) => {
      if (ts.isImportDeclaration(statement)) return true;
      if (ts.isExportDeclaration(statement)) return !!statement.moduleSpecifier;
      if (ts.isExportAssignment(statement)) return registers(statement.expression);
      if (ts.isVariableStatement(statement))
        return statement.declarationList.declarations.every((d) => registers(d.initializer));

      return false;
    });
    if (statements.length && allowed) pure.add(file);
  }

  return pure;
}

/**
 * Deletes the sources that were fully converted. It runs only after the writer's commit returned, so a refusal,
 * a failed gate or a rollback never reaches it. A file it cannot remove is reported and the rest go on; the
 * converted output is never touched.
 *
 * For TypeScript modules the candidates shrink to a fixpoint: a module that a kept module imports is kept, and
 * a pure registration module goes only when every module it imports goes, so nothing left imports a deleted file.
 */
export async function removeSources(
  converted: ConvertedSources,
  options: RemoveSourcesOptions = {},
): Promise<RemovalReport> {
  const remove = options.remove ?? unlink;
  const outputOf = new Map(converted.outputs.map((o) => [o.source, o.target]));
  const written = new Set(converted.written.map(real));
  const targets = new Set(converted.outputs.map((o) => real(o.target)));
  const blocked = new Map([...(converted.blocked ?? [])].map(([file, why]) => [real(file), why]));
  const pure = new Set([...(converted.pure ?? [])].map(real));
  const removed: string[] = [];
  const kept: string[] = [];
  const failed: string[] = [];
  const lines: string[] = [];
  const configLines: string[] = [];

  const candidates = [...new Set([...converted.inputs, ...(converted.pure ?? [])])];
  const why = new Map<string, string>();
  for (const input of candidates) {
    const target = outputOf.get(input);
    const resolved = real(input);
    const isPure = pure.has(resolved);
    let reason: string | undefined;
    if (isPure) reason = undefined;
    else if (blocked.has(resolved)) reason = blocked.get(resolved);
    else if (target === undefined) reason = 'it holds no declaration, so its comments exist nowhere else';
    else if (targets.has(resolved)) reason = 'it is also an output of this run';
    else if (!options.dryRun && !written.has(real(target))) reason = 'its converted module was not written';
    if (reason === undefined && converted.claims.filter((c) => c.sources.some((s) => real(s) === resolved)).length > 1)
      reason = 'another schema entry reads it';
    if (reason !== undefined) why.set(resolved, reason);
  }

  const imports = new Map([...(converted.imports ?? [])].map(([m, deps]) => [real(m), deps.map(real)]));
  const candidateSet = new Set(candidates.map(real));
  const goes = (file: string): boolean => candidateSet.has(file) && !why.has(file);
  for (let changed = true; changed;) {
    changed = false;
    for (const [module, deps] of imports) {
      const stays = !goes(module);
      for (const dep of deps) {
        if (stays && goes(dep)) {
          why.set(dep, `${module} stays and imports it`);
          changed = true;
        }
      }
      if (pure.has(module) && !stays && (!deps.length || deps.some((dep) => !goes(dep)))) {
        why.set(module, 'a module it imports stays');
        changed = true;
      }
    }
  }

  for (const input of candidates) {
    const target = outputOf.get(input);
    const resolved = real(input);
    const reason = why.get(resolved);
    if (reason !== undefined) {
      kept.push(input);
      lines.push(`kept ${input}: ${reason}`);
      continue;
    }

    if (options.dryRun) {
      lines.push(`would remove ${input}`);
    } else {
      try {
        await remove(input);
      } catch (error) {
        failed.push(input);
        lines.push(`NOT removed ${input}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      lines.push(`removed ${input}`);
    }
    removed.push(input);

    for (const claim of converted.claims) {
      for (const { key, file } of claim.listed) {
        if (real(file) !== resolved) continue;
        const entry = claim.name ? ` in schema '${claim.name}'` : '';
        configLines.push(
          target === undefined || key === 'entry'
            ? `change '${key}'${entry}: ${file} no longer exists, so point it at the .cerial files or generate stops`
            : `change '${key}'${entry} from ${file} to ${target}, or generate stops: the file no longer exists`,
        );
      }
    }
  }

  return { removed, kept, failed, lines: [...lines, ...configLines] };
}
