#!/usr/bin/env bun

import { defineCommand, runMain } from 'citty';
import { generateCommand } from '../src/cli/commands/generate';
import { initCommand } from '../src/cli/commands/init';

// Handle -g alias for generate (citty doesn't support command aliases natively)
if (process.argv[2] === '-g') {
  process.argv[2] = 'generate';
}

const main = defineCommand({
  meta: {
    name: 'cerial',
    description: 'A Prisma-like ORM for SurrealDB',
  },
  subCommands: {
    generate: generateCommand,
    init: initCommand,
  },
});

runMain(main);
