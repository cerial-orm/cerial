import { relative } from 'node:path';
import { defineCommand } from 'citty';
import { resolveConfig as resolveFormatConfig } from '../../formatter/rules';
import type { FormatConfig } from '../../formatter/types';
import { loadConfig, resolveConfig } from '../config';
import { formatSchema } from '../format';
import type { FormatWatchTarget } from '../watcher';
import { startFormatterWatcher } from '../watcher';

export const formatCommand = defineCommand({
  meta: {
    name: 'format',
    description: 'Format .cerial schema files',
  },
  args: {
    schema: {
      type: 'string',
      alias: 's',
      description: 'Path to schema file or directory',
    },
    config: {
      type: 'string',
      alias: 'C',
      description: 'Path to config file',
    },
    name: {
      type: 'string',
      alias: 'n',
      description: 'Format only a specific schema by name',
    },
    watch: {
      type: 'boolean',
      alias: 'w',
      description: 'Watch for schema changes and auto-format',
    },
    check: {
      type: 'boolean',
      description: 'Check mode — exit 1 if files need formatting',
    },
    verbose: {
      type: 'boolean',
      alias: 'v',
      description: 'Verbose output',
    },
  },
  async run({ args }) {
    const cwd = process.cwd();

    // Resolve schema paths and format config from config file or flags
    const targets = await resolveFormatTargets({
      schema: args.schema,
      config: args.config,
      name: args.name,
      cwd,
    });

    if (!targets.length) {
      console.error('No schema paths found. Use -s to specify a schema path, or create a config file.');
      process.exit(1);
    }

    if (args.watch) {
      if (args.check) {
        console.error('--watch and --check cannot be used together.');
        process.exit(1);
      }

      const watchTargets: FormatWatchTarget[] = targets.map((t) => ({
        schemaPath: t.path,
        formatConfig: t.formatConfig,
      }));
      const config = resolveFormatConfig(targets[0]?.formatConfig);
      await startFormatterWatcher(watchTargets, config, { verbose: args.verbose });

      return;
    }

    let totalFormatted = 0;
    let totalUnchanged = 0;
    let totalErrors = 0;
    const needsFormatting: string[] = [];

    for (const target of targets) {
      const summary = await formatSchema({
        schemaPath: target.path,
        formatConfig: target.formatConfig,
        check: args.check,
        verbose: args.verbose,
      });

      totalFormatted += summary.formatted;
      totalUnchanged += summary.unchanged;
      totalErrors += summary.errors.length;

      // Collect files needing formatting (for check mode report)
      if (args.check && summary.formatted > 0) {
        // In check mode, 'formatted' count means files that WOULD change
        needsFormatting.push(...Array.from({ length: summary.formatted }, () => target.path));
      }

      // Report errors
      for (const err of summary.errors) {
        const rel = relative(cwd, err.path);
        console.error(`  ✗ ${rel}:${err.line}:${err.column}: ${err.message}`);
      }
    }

    if (args.check) {
      if (totalFormatted > 0 || totalErrors > 0) {
        const parts: string[] = [];
        if (totalFormatted > 0)
          parts.push(
            `${totalFormatted} file${totalFormatted === 1 ? '' : 's'} need${totalFormatted === 1 ? 's' : ''} formatting`,
          );
        if (totalErrors > 0) parts.push(`${totalErrors} error${totalErrors === 1 ? '' : 's'}`);
        console.log(`✗ ${parts.join(', ')}`);
        process.exit(1);
      }

      console.log('✓ All files are formatted');
      process.exit(0);
    }

    // Normal mode summary
    const parts: string[] = [];
    if (totalFormatted > 0) parts.push(`formatted ${totalFormatted}`);
    if (totalUnchanged > 0) parts.push(`${totalUnchanged} unchanged`);
    if (totalErrors > 0) parts.push(`${totalErrors} error${totalErrors === 1 ? '' : 's'}`);

    if (totalErrors > 0) {
      console.log(`✗ ${parts.join(', ')}`);
      process.exit(1);
    }

    console.log(`✓ ${parts.join(', ')}`);
  },
});

/** A resolved format target: schema path + optional format config */
interface FormatTarget {
  path: string;
  formatConfig?: FormatConfig;
}

interface ResolveOptions {
  schema?: string;
  config?: string;
  name?: string;
  cwd: string;
}

/**
 * Resolve format targets from CLI args.
 * Priority: -s flag > config file > default './schemas'
 */
async function resolveFormatTargets(options: ResolveOptions): Promise<FormatTarget[]> {
  const { schema, config: configPath, name, cwd } = options;

  // -s flag: single schema path, no config
  if (schema) {
    return [{ path: schema }];
  }

  // Try loading config
  const config = await loadConfig(configPath);
  if (config) {
    const entries = resolveConfig(config, cwd);
    let targets = entries.map((entry) => ({
      path: entry.path,
      formatConfig: entry.format,
    }));

    // Filter by name if -n flag
    if (name) {
      const entry = entries.find((e) => e.name === name);
      if (!entry) {
        const available = entries.map((e) => e.name).join(', ');
        console.error(`Schema '${name}' not found. Available schemas: ${available}`);
        process.exit(1);
      }
      targets = [{ path: entry.path, formatConfig: entry.format }];
    }

    return targets;
  }

  // Fallback: default schema path
  return [{ path: './schemas' }];
}
