import { parseArgs } from 'node:util';
import * as v from 'valibot';
import { CerialValidationError } from '../../errors';
import { join } from './shared';

const NonEmpty = (message: string) => v.pipe(v.string(message), v.trim(), v.minLength(1, message));

const UrlFlag = v.pipe(
  NonEmpty('--url needs a value'),
  v.check((value) => {
    try {
      return ['http:', 'https:', 'ws:', 'wss:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, '--url must be an http, https, ws or wss url such as http://127.0.0.1:8000'),
);

/** There is no password flag on purpose: a secret on argv shows in `ps` and shell history. */
const MigrateArgsSchema = v.object({
  url: v.optional(UrlFlag),
  namespace: v.optional(NonEmpty('--namespace needs a value')),
  database: v.optional(NonEmpty('--database needs a value')),
  username: v.optional(NonEmpty('--username needs a value')),
  name: v.optional(NonEmpty('--name needs a value')),
  config: v.optional(NonEmpty('--config needs a value')),
  out: v.optional(NonEmpty('--out needs a value')),
  json: v.optional(v.boolean('--json takes no value')),
  'from-schema': v.optional(v.boolean('--from-schema takes no value')),
  'allow-destructive': v.optional(v.boolean('--allow-destructive takes no value')),
  'allow-data-loss': v.optional(v.boolean('--allow-data-loss takes no value')),
  'accept-drift': v.optional(v.boolean('--accept-drift takes no value')),
});

export type MigrateArgs = v.InferOutput<typeof MigrateArgsSchema>;

export interface ParsedMigrateArgs {
  readonly flags: MigrateArgs;
  /** Arguments that are not flags, such as the plan file of `apply <file>` */
  readonly positionals: readonly string[];
}

const BOOLEAN_FLAGS = ['json', 'from-schema', 'allow-destructive', 'allow-data-loss', 'accept-drift'] as const;
const KNOWN_FLAGS = new Set(Object.keys(MigrateArgsSchema.entries));
const SHORT_FLAGS: Readonly<Record<string, string>> = { config: 'C' };
// Declared so `--url value` takes its value; an undeclared flag would parse as a boolean and orphan the value
const OPTIONS = Object.fromEntries(
  [...KNOWN_FLAGS].map((flag) => [
    flag,
    {
      type: (BOOLEAN_FLAGS as readonly string[]).includes(flag) ? 'boolean' : 'string',
      ...(SHORT_FLAGS[flag] ? { short: SHORT_FLAGS[flag] } : {}),
    } as const,
  ]),
);

/** The flags that take a value, as they are written on the command line, so a caller can tell a value from a subcommand */
export const VALUE_FLAGS: ReadonlySet<string> = new Set(
  [...KNOWN_FLAGS].flatMap((flag) =>
    (BOOLEAN_FLAGS as readonly string[]).includes(flag)
      ? []
      : [join('--', flag), ...(SHORT_FLAGS[flag] ? [join('-', SHORT_FLAGS[flag])] : [])],
  ),
);

export type MigrateCommand = 'status' | 'plan' | 'apply' | 'baseline';

const CONNECTION_FLAGS = ['url', 'namespace', 'database', 'username', 'name', 'config'];
const COMMAND_FLAGS: Readonly<Record<MigrateCommand, ReadonlySet<string>>> = {
  status: new Set([...CONNECTION_FLAGS, 'json']),
  plan: new Set([...CONNECTION_FLAGS, 'out']),
  apply: new Set([...CONNECTION_FLAGS, 'from-schema', 'allow-destructive', 'allow-data-loss']),
  baseline: new Set([...CONNECTION_FLAGS, 'accept-drift']),
};
/** Only `apply` takes an argument: the plan file */
const COMMAND_POSITIONALS: Readonly<Record<MigrateCommand, number>> = { status: 0, plan: 0, apply: 1, baseline: 0 };

/**
 * Parse the flags of a `migrate` subcommand from raw argv.
 *
 * An unknown flag is refused by name: dropping `--allow-destrucive` silently would run a migration the
 * operator believed was authorised, or not authorised, in a way they did not intend. Every message
 * names the flag at fault and never echoes a value other than the flag name. A flag or argument that exists
 * but belongs to another subcommand is refused too: `migrate plan ./out` writing to the default directory, or
 * `apply --accept-drift` being ignored, would each leave the operator believing something that did not happen.
 */
export function parseMigrateArgs(argv: readonly string[], command: MigrateCommand): ParsedMigrateArgs {
  const { values, positionals } = parseArgs({
    args: [...argv],
    options: OPTIONS,
    strict: false,
    allowPositionals: true,
  });

  const unknown = Object.keys(values).filter((key) => !KNOWN_FLAGS.has(key));
  if (unknown.length) {
    throw new CerialValidationError(
      `Unknown migrate ${unknown.length > 1 ? 'flags' : 'flag'} ${unknown.map((key) => `--${key}`).join(', ')}.`,
    );
  }

  const foreign = Object.keys(values).filter((key) => !COMMAND_FLAGS[command].has(key));
  if (foreign.length) {
    throw new CerialValidationError(`migrate ${command} does not take ${foreign.map((key) => `--${key}`).join(', ')}.`);
  }
  if (positionals.length > COMMAND_POSITIONALS[command]) {
    throw new CerialValidationError(
      COMMAND_POSITIONALS[command]
        ? `migrate ${command} takes one argument, the plan file.`
        : `migrate ${command} takes no arguments.`,
    );
  }

  const result = v.safeParse(MigrateArgsSchema, values);
  if (!result.success) throw new CerialValidationError(result.issues.map((issue) => issue.message).join(' '));

  return { flags: result.output, positionals };
}
