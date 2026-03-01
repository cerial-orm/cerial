import { defineCommand, runMain } from 'citty';

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
    generate: () => import('../src/cli/commands/generate').then((m) => m.generateCommand),
    format: () => import('../src/cli/commands/format').then((m) => m.formatCommand),
    init: () => import('../src/cli/commands/init').then((m) => m.initCommand),
  },
});

runMain(main);
