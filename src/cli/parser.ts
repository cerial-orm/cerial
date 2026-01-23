/**
 * CLI argument parser
 */

import type { CLIOptions } from './validators';

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

      case '-h':
      case '--help':
        printHelp();
        process.exit(0);

      default:
        // If no flag, treat as schema path
        if (!arg?.startsWith('-') && !options.schema) {
          options.schema = arg;
        }
    }
  }

  return options;
}

/** Print help message */
export function printHelp(): void {
  console.log(`
surreal-om generate - Generate TypeScript client from schema files

Usage:
  surreal-om generate [options]

Options:
  -s, --schema <path>   Path to schema file or directory (default: ./schemas)
  -o, --output <path>   Output directory for generated files (required)
  -w, --watch           Watch for schema changes and regenerate
  -v, --verbose         Verbose output
  -h, --help            Show this help message

Examples:
  surreal-om generate -o ./db-client
  surreal-om generate -s ./schemas -o ./db-client
  surreal-om generate -s ./schemas/user.schema -o ./db-client
`);
}
