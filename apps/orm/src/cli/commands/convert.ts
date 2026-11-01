import { defineCommand } from 'citty';
import { runConvert } from '../convert/run';

export const convertCommand = defineCommand({
  meta: {
    name: 'convert',
    description: 'Convert .cerial schemas to TypeScript modules; comments are kept',
  },
  args: {
    to: {
      type: 'string',
      description: 'Direction to convert: ts',
    },
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
      description: 'Convert only a specific schema by name',
    },
    output: {
      type: 'string',
      alias: 'o',
      description: 'Write the converted files under this directory instead of beside the sources',
    },
    force: {
      type: 'boolean',
      description: 'Replace existing output files; a schema source is never replaced',
    },
    'remove-source': {
      type: 'boolean',
      description: 'Delete the .cerial files that were fully converted, after the output is written',
    },
    'dry-run': {
      type: 'boolean',
      description: 'Check the conversion and list the files without writing them',
    },
  },
  async run({ args }) {
    try {
      const result = await runConvert({
        to: args.to,
        schema: args.schema,
        config: args.config,
        name: args.name,
        output: args.output,
        force: args.force,
        dryRun: args['dry-run'],
        removeSource: args['remove-source'],
      });
      for (const warning of result.warnings) console.warn(`warning: ${warning}`);
      for (const line of result.lines) console.log(line);
      if (result.failures.length) process.exit(1);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  },
});
