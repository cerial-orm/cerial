import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import type { FilterConfig } from '../../../../src/cli/filters';
import { loadCerialIgnore, resolvePathFilter } from '../../../../src/cli/filters';
import { findSchemaRoots, resolveSinglePath } from '../../../../src/cli/resolvers';

export interface Project {
  readonly cwd: string;
  readonly path: (...segments: string[]) => string;
  readonly cleanup: () => void;
  /** Write (or replace) the `.cerialignore` in `dir`, relative to the project root; '' is the root. */
  readonly writeCerialIgnore: (dir: string, content: string) => void;
  readonly removeCerialIgnore: (dir: string) => void;
}

/** Build a fixture tree in a fresh temp directory; `files` maps relative path to content. */
export function makeProject(files: Record<string, string>): Project {
  const cwd = mkdtempSync(resolve(tmpdir(), 'cerial-filter-cascade-'));

  for (const [rel, content] of Object.entries(files)) {
    const full = resolve(cwd, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }

  return {
    cwd,
    path: (...segments) => resolve(cwd, ...segments),
    cleanup: () => rmSync(cwd, { recursive: true, force: true }),
    writeCerialIgnore: (dir, content) => writeFileSync(resolve(cwd, dir, '.cerialignore'), content),
    removeCerialIgnore: (dir) => rmSync(resolve(cwd, dir, '.cerialignore'), { force: true }),
  };
}

function names(files: string[], base: string): string[] {
  return files.map((f) => relative(base, f)).sort();
}

/**
 * Mirrors `generate -s <path>`: only the root `.cerialignore` applies; config is ignored.
 * Selected files are returned relative to `schemaPath`.
 */
export async function selectWithSchemaFlag(project: Project, schemaPath: string): Promise<string[]> {
  const rootCerialIgnore = (await loadCerialIgnore(project.cwd)) ?? undefined;
  const filter = rootCerialIgnore ? resolvePathFilter({ rootCerialIgnore, basePath: project.cwd }) : undefined;
  const files = await resolveSinglePath(schemaPath, project.cwd, filter);

  return names(files, project.path(schemaPath));
}

export interface ConfigLayers {
  readonly root?: FilterConfig;
  readonly schema?: FilterConfig;
}

/**
 * Mirrors the config path of `generate`: root config + schema config + root `.cerialignore`
 * + the `.cerialignore` inside the schema directory. Files are relative to `schemaDir`.
 */
export async function selectWithConfig(project: Project, schemaDir: string, layers: ConfigLayers): Promise<string[]> {
  const rootCerialIgnore = (await loadCerialIgnore(project.cwd)) ?? undefined;
  const folderCerialIgnore = (await loadCerialIgnore(project.path(schemaDir))) ?? undefined;
  const filter = resolvePathFilter({
    rootConfig: layers.root,
    schemaConfig: layers.schema,
    rootCerialIgnore,
    folderCerialIgnore,
    basePath: project.cwd,
    schemaPath: project.path(schemaDir),
  });
  const files = await resolveSinglePath(schemaDir, project.cwd, filter);

  return names(files, project.path(schemaDir));
}

/**
 * Mirrors the convention-marker path of `generate`: roots are found with the root-only filter,
 * then each root's files go through root + folder `.cerialignore`. Files are relative to `cwd`.
 */
export async function selectWithConventions(project: Project, rootConfig?: FilterConfig): Promise<string[]> {
  const rootCerialIgnore = (await loadCerialIgnore(project.cwd)) ?? undefined;
  const rootFilter =
    rootCerialIgnore || rootConfig
      ? resolvePathFilter({ rootConfig, rootCerialIgnore, basePath: project.cwd })
      : undefined;
  const roots = await findSchemaRoots(project.cwd, rootFilter);
  const selected: string[] = [];

  for (const root of roots) {
    const folderCerialIgnore = (await loadCerialIgnore(root.path)) ?? undefined;
    const filter = resolvePathFilter({
      rootConfig,
      rootCerialIgnore,
      folderCerialIgnore,
      basePath: project.cwd,
      schemaPath: root.path,
    });
    selected.push(...(await resolveSinglePath(root.path, project.cwd, filter)));
  }

  return names(selected, project.cwd);
}
