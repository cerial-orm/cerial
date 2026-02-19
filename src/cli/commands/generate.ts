import { loadConfig, resolveConfig } from '../config';
import { applyFolderOverridesAndDiscover, generate } from '../generate';
import { parseArgs } from '../parser';
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
