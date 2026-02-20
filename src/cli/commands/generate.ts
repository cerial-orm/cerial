import { basename, resolve } from 'node:path';
import { detectNestedSchemaRoots, loadConfig, resolveConfig } from '../config';
import type { FilterConfig } from '../filters';
import { loadCerialIgnore, resolvePathFilter } from '../filters';
import { applyFolderOverridesAndDiscover, generate } from '../generate';
import { parseArgs } from '../parser';
import { findSchemaRoots } from '../resolvers';
import type { WatchTarget } from '../watcher';
import { startWatcher } from '../watcher';
import type { Command } from './types';

async function buildWatchTargets(options: ReturnType<typeof parseArgs>): Promise<WatchTarget[]> {
  const cwd = process.cwd();

  // -s flag path: load root .cerialignore
  if (options.schema) {
    const rootCerialIgnore = (await loadCerialIgnore(cwd)) ?? undefined;
    const filter = rootCerialIgnore ? resolvePathFilter({ rootCerialIgnore, basePath: cwd }) : undefined;

    return [
      {
        schemaPath: options.schema,
        outputDir: options.output!,
        filter,
      },
    ];
  }

  // Config path: build per-schema filters
  const config = await loadConfig(options.config);
  if (config) {
    const rootCerialIgnore = (await loadCerialIgnore(cwd)) ?? undefined;
    const rootFilterConfig: FilterConfig = {
      ignore: config.ignore,
      exclude: config.exclude,
      include: config.include,
    };
    const hasRootFilter = rootCerialIgnore || config.ignore?.length || config.exclude?.length;
    const rootFilter = hasRootFilter
      ? resolvePathFilter({ rootConfig: rootFilterConfig, rootCerialIgnore, basePath: cwd })
      : undefined;

    let entries = resolveConfig(config);
    entries = await applyFolderOverridesAndDiscover(entries, cwd, rootFilter);

    if (options.name) {
      entries = entries.filter((e) => e.name === options.name);
    }
    if (options.output) {
      entries = entries.map((e) => ({ ...e, output: options.output! }));
    }

    const targets: WatchTarget[] = [];
    for (const entry of entries) {
      const schemaEntry = config.schemas?.[entry.name];
      const schemaFilterConfig: FilterConfig | undefined = schemaEntry
        ? { ignore: schemaEntry.ignore, exclude: schemaEntry.exclude, include: schemaEntry.include }
        : undefined;
      const folderCerialIgnore = (await loadCerialIgnore(entry.path)) ?? undefined;

      const filter = resolvePathFilter({
        rootConfig: rootFilterConfig,
        schemaConfig: schemaFilterConfig,
        rootCerialIgnore,
        folderCerialIgnore,
        basePath: cwd,
        schemaPath: entry.path,
      });

      targets.push({
        name: entry.name,
        schemaPath: entry.path,
        outputDir: entry.output,
        clientClassName: entry.clientClassName,
        filter,
      });
    }

    return targets;
  }

  // Convention marker path: build per-root filters
  const rootCerialIgnore = (await loadCerialIgnore(cwd)) ?? undefined;
  const markerRootFilter = rootCerialIgnore ? resolvePathFilter({ rootCerialIgnore, basePath: cwd }) : undefined;
  const schemaRoots = await findSchemaRoots(cwd, markerRootFilter);

  if (schemaRoots.length) {
    // Check for marker-to-marker nesting
    const typedRoots = schemaRoots.map(({ path: mp }) => ({
      path: mp,
      type: 'convention-marker' as const,
    }));
    const { ignored } = detectNestedSchemaRoots(typedRoots);
    const validRoots = schemaRoots.filter(({ path: mp }) => !ignored.has(mp));

    if (validRoots.length) {
      const targets: WatchTarget[] = [];
      for (const root of validRoots) {
        const folderCerialIgnore = (await loadCerialIgnore(root.path)) ?? undefined;
        const filter = resolvePathFilter({
          rootCerialIgnore,
          folderCerialIgnore,
          basePath: cwd,
          schemaPath: root.path,
        });

        targets.push({
          name: basename(root.path),
          schemaPath: root.path,
          outputDir: options.output ?? resolve(root.path, 'client'),
          filter,
        });
      }

      return targets;
    }
  }

  // Legacy fallback
  const legacyFilter = rootCerialIgnore ? resolvePathFilter({ rootCerialIgnore, basePath: cwd }) : undefined;

  return [
    {
      schemaPath: options.schema ?? './schemas',
      outputDir: options.output!,
      filter: legacyFilter,
    },
  ];
}

export const generateCommand: Command = {
  name: 'generate',
  aliases: ['-g'],
  description: 'Generate TypeScript client from schema files',
  async run(args) {
    const options = parseArgs(args);
    const result = await generate(options);

    if (!result.success) {
      console.error('Error generating files:', result.errors);
      process.exit(1);
    }

    if (options.watch) {
      const targets = await buildWatchTargets(options);
      await startWatcher(targets);
    }
  },
};
