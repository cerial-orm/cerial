#!/usr/bin/env bun

import { printHelp } from '../src/cli';
import type { Command } from '../src/cli/commands';
import { generateCommand, initCommand } from '../src/cli/commands';

const commands: Command[] = [generateCommand, initCommand];

const args = process.argv.slice(2);
const commandName = args[0];

if (!commandName || commandName === '-h' || commandName === '--help') {
  printHelp();
  process.exit(0);
}

const cmd = commands.find((c) => c.name === commandName || c.aliases.includes(commandName));

if (cmd) {
  await cmd.run(args.slice(1));
} else {
  console.error(`Unknown command: ${commandName}`);
  printHelp();
  process.exit(1);
}
