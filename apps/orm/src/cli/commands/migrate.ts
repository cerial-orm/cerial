import { defineCommand } from 'citty';
import type { MigrateEnv } from '../migrate/connection';
import { migrateStatus } from '../migrate/status';

const connectionArgs = {
  url: { type: 'string', description: 'Database url (or CERIAL_DB_URL)' },
  namespace: { type: 'string', description: 'Namespace (or CERIAL_DB_NAMESPACE)' },
  database: { type: 'string', description: 'Database (or CERIAL_DB_DATABASE)' },
  username: { type: 'string', description: 'Username (or CERIAL_DB_USERNAME); the password is CERIAL_DB_PASSWORD' },
  name: { type: 'string', description: 'Limit to one schema entry by name' },
  config: { type: 'string', alias: 'C', description: 'Path to config file' },
} as const;

const statusCommand = defineCommand({
  meta: {
    name: 'status',
    description:
      'Report how the live database stands against the schema. Exit 0 in sync, 1 drift or pending, 2 failure',
  },
  args: {
    ...connectionArgs,
    json: { type: 'boolean', description: 'Print one JSON object for CI' },
  },
  async run({ rawArgs }) {
    const result = await migrateStatus({ argv: rawArgs, env: process.env as MigrateEnv });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  },
});

export const migrateCommand = defineCommand({
  meta: {
    name: 'migrate',
    description: 'Inspect and change the live database schema',
  },
  subCommands: {
    status: statusCommand,
  },
});
