import { dirname, resolve } from 'node:path';
import { defineCommand } from 'citty';
import { resolveConfig as resolveFormatConfig } from '../../formatter';
import { loadConfig, resolveConfig } from '../config';
import { discoveredClientClassName, discoverSchemaRoots } from '../discover-roots';
import type { FilterConfig } from '../filters';
import { loadCerialIgnore, resolvePathFilter } from '../filters';
import { formatSchema, listedCerialFiles } from '../format';
import { applyFolderOverridesAndDiscover, buildSchemaFilters, entryDatabasePins, generate } from '../generate';
import { logger } from '../utils';
import type { CLIOptions, LogOutputLevel } from '../validators';
import type { WatchTarget } from '../watcher';
import { startWatcher } from '../watcher';

/**
 * `pins` compares every entry's tables, as generation does, so a target regenerates with the same database
 * pins; it parses every entry and refuses a table two entries share, so only a run that generates asks for it.
 */
export async function buildWatchTargets(options: CLIOptions, { pins = false } = {}): Promise<WatchTarget[]> {
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

    // Same directory one-shot generation scopes discovery, filters and out-of-scope matching to
    const configDir = options.config ? dirname(resolve(options.config)) : cwd;

    let entries = resolveConfig(config);
    entries = await applyFolderOverridesAndDiscover(entries, configDir, rootFilter);

    if (options.name) {
      entries = entries.filter((e) => e.name === options.name);
    }
    if (options.output) {
      entries = entries.map((e) => ({ ...e, output: options.output! }));
    }

    const filters = await buildSchemaFilters(config, entries, rootFilterConfig, rootCerialIgnore, configDir);
    const databasePins = pins ? await entryDatabasePins(entries, configDir, filters) : undefined;

    return entries.map((entry) => ({
      name: entry.name,
      schemaPath: entry.path,
      outputDir: entry.output,
      clientClassName: entry.clientClassName,
      typeFiles: entry.typeFiles,
      configPath: options.config,
      ...(entry.entry || entry.files ? { entry: entry.entry, files: entry.files, entryOnly: entry.entryOnly } : {}),
      filter: filters.get(entry.name),
      filterRoot: configDir,
      connection: entry.connection,
      databasePins: databasePins?.get(entry.name),
    }));
  }

  // No config: the same discovery as one-shot generation (folder configs, then convention markers)
  const rootCerialIgnore = (await loadCerialIgnore(cwd)) ?? undefined;
  const found = await discoverSchemaRoots(cwd);

  if (found) {
    return found.roots.map((root) => ({
      name: root.name,
      schemaPath: root.dir,
      outputDir: options.output ?? resolve(root.dir, root.output ?? 'client'),
      clientClassName: discoveredClientClassName(found.roots, root),
      typeFiles: root.typeFiles,
      filter: root.filter,
    }));
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
        // An entry-only target's folder holds code, so only its listed files are formatted
        const summary = await formatSchema({
          schemaPath: target.schemaPath,
          formatConfig,
          files: listedCerialFiles(target),
          directory: !target.entryOnly,
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
      const targets = await buildWatchTargets(options, { pins: true });

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
