import { basename, resolve } from 'node:path';
import { defineCommand } from 'citty';
import { resolveConfig as resolveFormatConfig } from '../../formatter';
import { detectNestedSchemaRoots, loadConfig, resolveConfig } from '../config';
import type { FilterConfig } from '../filters';
import { loadCerialIgnore, resolvePathFilter } from '../filters';
import { formatSchema } from '../format';
import { applyFolderOverridesAndDiscover, generate } from '../generate';
import { findSchemaRoots } from '../resolvers';
import { logger } from '../utils';
import type { CLIOptions, LogOutputLevel } from '../validators';
import type { WatchTarget } from '../watcher';
import { startWatcher } from '../watcher';

async function buildWatchTargets(options: CLIOptions): Promise<WatchTarget[]> {
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

export const generateCommand = defineCommand({
  meta: {
    name: 'generate',
    description: 'Generate TypeScript client from schema files',
  },
  args: {
    schema: {
      type: 'string',
      alias: 's',
      description: 'Path to schema file or directory',
    },
    output: {
      type: 'string',
      alias: 'o',
      description: 'Output directory for generated files',
    },
    name: {
      type: 'string',
      alias: 'n',
      description: 'Generate only a specific schema by name',
    },
    config: {
      type: 'string',
      alias: 'C',
      description: 'Path to config file',
    },
    clean: {
      type: 'boolean',
      alias: 'c',
      description: 'Delete entire output directory before generating',
    },
    watch: {
      type: 'boolean',
      alias: 'w',
      description: 'Watch for schema changes and regenerate',
    },
    format: {
      type: 'boolean',
      alias: 'f',
      description: 'Auto-format schema files before generating',
    },
    verbose: {
      type: 'boolean',
      alias: 'v',
      description: 'Verbose output',
    },
    log: {
      type: 'string',
      alias: 'l',
      default: 'minimal',
      description: 'Log output level: minimal, medium, full',
    },
    yes: {
      type: 'boolean',
      alias: 'y',
      description: 'Accept all defaults, skip interactive prompts',
    },
  },
  async run({ args }) {
    const startTime = performance.now();

    const logLevel = args.log;
    if (!['minimal', 'medium', 'full'].includes(logLevel)) {
      console.error(`Invalid log level: ${logLevel}. Use minimal, medium, or full.`);
      process.exit(1);
    }

    const options: CLIOptions = {
      schema: args.schema,
      output: args.output,
      name: args.name,
      config: args.config,
      clean: args.clean,
      watch: args.watch,
      format: args.format,
      verbose: args.verbose,
      log: logLevel as LogOutputLevel,
      yes: args.yes,
    };

    // One-shot mode: format all schemas before generating
    if (options.format && !options.watch) {
      const targets = await buildWatchTargets(options);
      const formatConfig = resolveFormatConfig();

      for (const target of targets) {
        const summary = await formatSchema({
          schemaPath: target.schemaPath,
          formatConfig,
          verbose: options.verbose,
        });

        if (summary.errors.length && options.verbose) {
          for (const error of summary.errors) {
            console.error(`Format error in ${error.path}:${error.line}:${error.column}: ${error.message}`);
          }
        }
      }
    }

    const result = await generate(options);

    if (!result.success) {
      console.error('Error generating files:', result.errors);
      logger.done(performance.now() - startTime);
      process.exit(1);
    }

    if (!options.watch) {
      logger.done(performance.now() - startTime);
    }

    if (options.watch) {
      const targets = await buildWatchTargets(options);

      // Watch mode with format: create custom callback that formats before generating
      if (options.format) {
        const formatConfig = resolveFormatConfig();
        await startWatcher(targets, { format: true, formatConfig });
      } else {
        await startWatcher(targets);
      }
    }
  },
});
