import { basename, resolve } from 'node:path';
import { detectNestedSchemaRoots, loadConfig, resolveConfig } from '../config';
import { applyFolderOverridesAndDiscover, generate } from '../generate';
import { parseArgs } from '../parser';
import { findSchemaRoots } from '../resolvers';
import type { WatchTarget } from '../watcher';
import { startWatcher } from '../watcher';
import type { Command } from './types';

async function buildWatchTargets(options: ReturnType<typeof parseArgs>): Promise<WatchTarget[]> {
  if (options.schema) {
    return [
      {
        schemaPath: options.schema,
        outputDir: options.output!,
      },
    ];
  }

  const config = await loadConfig(options.config);
  if (config) {
    let entries = resolveConfig(config);
    entries = await applyFolderOverridesAndDiscover(entries, process.cwd());

    if (options.name) {
      entries = entries.filter((e) => e.name === options.name);
    }
    if (options.output) {
      entries = entries.map((e) => ({ ...e, output: options.output! }));
    }

    return entries.map((e) => ({
      name: e.name,
      schemaPath: e.path,
      outputDir: e.output,
      clientClassName: e.clientClassName,
    }));
  }

  // Try convention marker discovery
  const schemaRoots = await findSchemaRoots(process.cwd());
  if (schemaRoots.length) {
    // Check for marker-to-marker nesting
    const typedRoots = schemaRoots.map(({ path: mp }) => ({
      path: mp,
      type: 'convention-marker' as const,
    }));
    const { ignored } = detectNestedSchemaRoots(typedRoots);
    const validRoots = schemaRoots.filter(({ path: mp }) => !ignored.has(mp));

    if (validRoots.length) {
      return validRoots.map(({ path: mp }) => ({
        name: basename(mp),
        schemaPath: mp,
        outputDir: options.output ?? resolve(mp, 'client'),
      }));
    }
  }

  return [
    {
      schemaPath: options.schema ?? './schemas',
      outputDir: options.output!,
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
