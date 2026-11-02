import { basename } from 'node:path';
import { detectNestedSchemaRoots, findFolderConfigs } from './config';
import type { FilterConfig, PathFilter } from './filters';
import { loadCerialIgnore, resolvePathFilter } from './filters';
import { findSchemaRoots } from './resolvers';

export interface DiscoveredRoot {
  readonly name: string;
  readonly dir: string;
  /** The folder config's own `output`, relative to `dir`; markers have none */
  readonly output?: string;
  readonly filter: PathFilter;
}

export interface DiscoveredRoots {
  readonly source: 'folder-config' | 'marker';
  readonly roots: DiscoveredRoot[];
}

/**
 * The schema roots a project has when it has no config file and no `-s`: folder configs first, else convention
 * markers (nested markers dropped). Returns null when neither exists, which is the legacy default-location case.
 * Shared by `generate` and `migrate` so both resolve a zero-config project the same way.
 */
export async function discoverSchemaRoots(cwd: string): Promise<DiscoveredRoots | null> {
  const rootCerialIgnore = (await loadCerialIgnore(cwd)) ?? undefined;
  const rootFilter = rootCerialIgnore ? resolvePathFilter({ rootCerialIgnore, basePath: cwd }) : undefined;

  const folderConfigs = await findFolderConfigs(cwd, rootFilter);
  if (folderConfigs.length) {
    const roots: DiscoveredRoot[] = [];
    for (const { dir, config } of folderConfigs) {
      const folderFilterConfig: FilterConfig = {
        ignore: config.ignore,
        exclude: config.exclude,
        include: config.include,
      };
      const folderCerialIgnore = (await loadCerialIgnore(dir)) ?? undefined;
      roots.push({
        name: basename(dir),
        dir,
        output: config.output,
        filter: resolvePathFilter({
          rootCerialIgnore,
          folderConfig: folderFilterConfig,
          folderCerialIgnore,
          basePath: cwd,
          schemaPath: dir,
        }),
      });
    }

    return { source: 'folder-config', roots };
  }

  const schemaRoots = await findSchemaRoots(cwd, rootFilter);
  const { ignored } = detectNestedSchemaRoots(
    schemaRoots.map(({ path }) => ({ path, type: 'convention-marker' as const })),
  );
  const validRoots = schemaRoots.filter(({ path }) => !ignored.has(path));
  if (!validRoots.length) return null;

  const roots: DiscoveredRoot[] = [];
  for (const { path } of validRoots) {
    const folderCerialIgnore = (await loadCerialIgnore(path)) ?? undefined;
    roots.push({
      name: basename(path),
      dir: path,
      filter: resolvePathFilter({ rootCerialIgnore, folderCerialIgnore, basePath: cwd, schemaPath: path }),
    });
  }

  return { source: 'marker', roots };
}
