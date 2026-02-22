/**
 * Backward-compatible CLI wrappers
 *
 * These functions maintain the public API surface from src/main.ts
 * while the internal CLI has migrated to citty.
 */

import type { CLIOptions, LogOutputLevel } from './validators';

/** Parse CLI arguments into CLIOptions (backward-compatible wrapper) */
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
        }
        break;
      }

      default:
        if (!arg?.startsWith('-') && !options.schema) {
          options.schema = arg;
        }
    }
  }

  return options;
}

/** Print CLI help (backward-compatible wrapper) */
export function printHelp(): void {
  console.log(`
cerial - A Prisma-like ORM for SurrealDB

Usage:
  cerial <command> [options]

Commands:
  generate, -g          Generate TypeScript client from schema files
  init                  Initialize a cerial config file

Run 'cerial <command> --help' for command-specific options.
`);
}
