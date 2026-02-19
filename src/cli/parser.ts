/**
 * CLI argument parser
 */

import type { CLIOptions, LogOutputLevel } from './validators';

/** Parse CLI arguments */
export function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '-s':
      case '--schema':
        options.schema = args[++i];
        break;

      case '-o':
      case '--output':
        options.output = args[++i];
        break;

      case '-w':
      case '--watch':
        options.watch = true;
        break;

      case '-v':
      case '--verbose':
        options.verbose = true;
        break;

      case '-c':
      case '--clean':
        options.clean = true;
        break;

      case '-n':
      case '--name':
        options.name = args[++i];
        break;

      case '-C':
      case '--config':
        options.config = args[++i];
        break;

      case '-y':
      case '--yes':
        options.yes = true;
        break;

      case '-l':
      case '--log': {
        const level = args[++i] as LogOutputLevel;
        if (level === 'minimal' || level === 'medium' || level === 'full') {
          options.log = level;
        } else {
          console.error(`Invalid log level: ${level}. Use minimal, medium, or full.`);
          process.exit(1);
        }
        break;
      }

      case '-h':
      case '--help': {
        printHelp();
        process.exit(0);
        break;
      }

      default:
        // If no flag, treat as schema path
        if (!arg?.startsWith('-') && !options.schema) {
          options.schema = arg;
        }
    }
  }

  return options;
}

export function printHelp(): void {
  console.log(`
cerial - A Prisma-like ORM for SurrealDB

Usage:
  cerial <command> [options]

Commands:
  generate, -g          Generate TypeScript client from schema files
  init                  Initialize a cerial config file

Options:
  -s, --schema <path>   Path to schema file or directory (default: ./schemas)
  -o, --output <path>   Output directory for generated files (required)
  -n, --name <name>     Client class name (default: CerialClient)
  -C, --config <path>   Path to config file
  -c, --clean           Delete entire output directory before generating
  -w, --watch           Watch for schema changes and regenerate
  -v, --verbose         Verbose output
  -y, --yes             Accept all defaults, skip interactive prompts
  -l, --log <level>     Log output level: minimal (default), medium, full
  -h, --help            Show this help message

By default, stale files from previous generations are automatically removed
after generating. Use --clean to wipe the entire output directory first.

Examples:
  cerial generate -o ./db-client
  cerial generate -s ./schemas -o ./db-client
  cerial generate -s ./schemas -o ./db-client --clean
  cerial generate -C ./cerial.config.ts
  cerial init
`);
}
