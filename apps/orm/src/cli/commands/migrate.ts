import { defineCommand, renderUsage } from 'citty';
import type { MigrateEnv } from '../migrate/connection';
import { migrateApply } from '../migrate/apply';
import { migrateBaseline } from '../migrate/baseline';
import { migratePlan } from '../migrate/plan-file';
import { join } from '../migrate/shared';
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

const planCommand = defineCommand({
  meta: {
    name: 'plan',
    description: 'Write the pending changes to a timestamped .surql file, destructive statements commented out',
  },
  args: {
    ...connectionArgs,
    out: { type: 'string', description: 'Directory for the plan file (default cerial/migrations)' },
  },
  async run({ rawArgs }) {
    const result = await migratePlan({ argv: rawArgs, env: process.env as MigrateEnv });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  },
});

const applyCommand = defineCommand({
  meta: {
    name: 'apply',
    description:
      'Apply the pending changes, from the schema (--from-schema) or from a reviewed plan file (apply <file>). Additive changes need no flag; destructive ones need --allow-destructive, and removing a table also --allow-data-loss. On the memory backend a failed apply rolls back; other backends are not yet measured',
  },
  args: {
    file: { type: 'positional', required: false, description: 'A plan file written by migrate plan' },
    ...connectionArgs,
    'from-schema': { type: 'boolean', description: 'Diff the live database against the schema and apply the result' },
    'allow-destructive': { type: 'boolean', description: 'Allow changes that can invalidate or remove data' },
    'allow-data-loss': {
      type: 'boolean',
      description: 'Allow removing a table with its rows (with --allow-destructive)',
    },
  },
  async run({ rawArgs }) {
    const result = await migrateApply({ argv: rawArgs, env: process.env as MigrateEnv });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  },
});

const baselineCommand = defineCommand({
  meta: {
    name: 'baseline',
    description:
      'Record the live schema as applied without running any DDL; only migration state is written. Refuses when the live schema differs from the schema files unless --accept-drift is passed. Tables the schema does not declare stay unmanaged',
  },
  args: {
    ...connectionArgs,
    'accept-drift': {
      type: 'boolean',
      description: 'Record the schema as applied although the live schema differs, listing what differs',
    },
  },
  async run({ rawArgs }) {
    const result = await migrateBaseline({ argv: rawArgs, env: process.env as MigrateEnv });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  },
});

const subCommands = {
  status: statusCommand,
  plan: planCommand,
  apply: applyCommand,
  baseline: baselineCommand,
};

export const migrateCommand = defineCommand({
  meta: {
    name: 'migrate',
    description: 'Inspect and change the live database schema',
  },
  subCommands,
  // citty exits 1 for a missing or unknown subcommand, which `migrate status` already uses for drift.
  // A usage error is exit 2 here, so the name is checked before citty dispatches.
  async setup({ rawArgs, cmd }) {
    const name = rawArgs.find((arg) => !arg.startsWith('-'));
    if (name !== undefined && name in subCommands) return;

    process.stderr.write(join(await renderUsage(cmd), '\n\n'));
    process.stderr.write(join(name === undefined ? 'No command specified.' : join('Unknown command ', name), '\n'));
    process.exit(2);
  },
});
