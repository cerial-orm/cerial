#!/usr/bin/env bun
/**
 * surreal-om CLI entry point
 */

import { parseArgs, printHelp, generate } from '../src/cli';

const args = process.argv.slice(2);

// Check for command
const command = args[0];

if (!command || command === '-h' || command === '--help') {
  printHelp();
  process.exit(0);
}

if (command === 'generate' || command === '-g') {
  // Parse remaining args
  const options = parseArgs(args.slice(1));
  const result = await generate(options);

  if (!result.success) {
    process.exit(1);
  }
} else {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}
