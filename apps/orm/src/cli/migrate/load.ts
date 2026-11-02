import { dirname, resolve } from 'node:path';
import { CerialGenerationError, CerialValidationError } from '../../errors';
import { buildDesiredSchema, fingerprint, schemaFingerprint } from '../../migrations';
import type { SchemaModel } from '../../migrations';
import type { ConnectionConfig, SchemaAST } from '../../types';
import { loadConfig, resolveConfig } from '../config';
import { applyFolderOverridesAndDiscover } from '../discovery';
import { discoverSchemaRoots } from '../discover-roots';
import type { PathFilter } from '../filters';
import { buildConfigRootFilter, buildRootFilter, buildSchemaFilters, schemaSource } from '../generate';
import { buildSchemaMetadata } from '../schema-metadata';
import { buildResolvedSchemaAst } from '../resolvers';
import type { EntryModels } from '../validators';
import { validateEntryTableNames, validateResolvedTypes, validateSchema } from '../validators';
import type { MigrateArgs } from './args';
import type { MigrateEnv, ResolvedMigrateConnection } from './connection';
import { resolveMigrateConnection } from './connection';

export interface LoadDesiredOptions {
  readonly flags: Pick<MigrateArgs, 'url' | 'namespace' | 'database' | 'username' | 'name' | 'config'>;
  readonly env: MigrateEnv;
  /** Base for relative config paths; defaults to the working directory */
  readonly cwd?: string;
}

/** A connection that is safe to print: the password is not part of it */
export interface PrintableConnection {
  readonly url: string;
  readonly namespace: string;
  readonly database: string;
  readonly username?: string;
}

export interface MigrateEntryDesired {
  readonly name: string;
  readonly desired: SchemaModel;
}

export interface MigrateTarget {
  readonly connection: PrintableConnection;
  /** The schema entries this target covers, in config order */
  readonly entries: readonly string[];
  /** Each covered entry's own desired model */
  readonly entryModels: readonly MigrateEntryDesired[];
  /** The union of the entries' tables, so a sibling entry's tables are not foreign to this target */
  readonly desired: SchemaModel;
  /** Fingerprint of each desired table by table name, and of the whole union */
  readonly tableFingerprints: Readonly<Record<string, string>>;
  readonly schemaFingerprint: string;
  /**
   * The full connection with its password, for the code that connects. A function so the secret is not a
   * property that `JSON.stringify`, `console.log` or an error's context would carry.
   */
  readonly credentials: () => ResolvedMigrateConnection;
}

/** Build the desired model from the same metadata `generate` hands its generators, so the two cannot drift */
function desiredOf(ast: SchemaAST): SchemaModel {
  const { modelRegistry, objectRegistry, tupleRegistry, literalRegistry } = buildSchemaMetadata(ast);

  return buildDesiredSchema(modelRegistry, objectRegistry, tupleRegistry, literalRegistry);
}

interface SchemaSource {
  readonly name: string;
  readonly connection?: ConnectionConfig;
  readonly explicitDatabase?: string;
  readonly ast: Parameters<typeof buildResolvedSchemaAst>[0];
}

/**
 * The schema entries of the project, found the way `generate` finds them: the config file when there is one,
 * else folder configs, else convention markers, else the default location. Without a config the connection
 * comes from flags and environment only.
 */
async function resolveSources(configPath: string | undefined, cwd: string): Promise<SchemaSource[]> {
  const config = await loadConfig(configPath, cwd);
  if (config) {
    const configDir = configPath ? dirname(resolve(cwd, configPath)) : cwd;
    const { filter: rootFilter, rootFilterConfig, rootCerialIgnore } = await buildConfigRootFilter(config, cwd);
    const entries = await applyFolderOverridesAndDiscover(resolveConfig(config, cwd), configDir, rootFilter);
    const filters = await buildSchemaFilters(config, entries, rootFilterConfig, rootCerialIgnore, configDir);

    return entries.map((entry) => ({
      name: entry.name,
      connection: entry.connection,
      explicitDatabase: entry.explicitDatabase,
      ast: { ...schemaSource(entry, configDir), filter: filters.get(entry.name) },
    }));
  }

  const found = await discoverSchemaRoots(cwd);
  if (found) {
    return found.roots.map((root) => ({ name: root.name, ast: { schemaPath: root.dir, filter: root.filter } }));
  }

  const legacyFilter: PathFilter | undefined = await buildRootFilter(cwd);

  return [{ name: 'default', ast: { filter: legacyFilter } }];
}

/**
 * Load every schema entry the config describes and group them by the connection they resolve to.
 *
 * Entries on one connection are one target whose desired model is the union of theirs; entries on different
 * connections stay separate targets. `--name` limits the load to one entry. An entry that fails to parse or
 * validate refuses the whole load, because a migration planned from half a schema would drop the other half.
 */
export async function loadDesired(options: LoadDesiredOptions): Promise<MigrateTarget[]> {
  const cwd = options.cwd ?? process.cwd();
  const { flags } = options;

  const sources = await resolveSources(flags.config, cwd);
  let selected = sources;
  if (flags.name) {
    selected = sources.filter((source) => source.name === flags.name);
    if (!selected.length) {
      throw new CerialValidationError(
        ['--name', flags.name, 'matches no schema. Available schemas:', sources.map((s) => s.name).join(', ')].join(
          ' ',
        ),
      );
    }
  }

  const loaded: Array<{ source: SchemaSource; ast: SchemaAST }> = [];
  for (const source of selected) {
    // preserveHandles: status and plan are read-only, so a mixed entry's handles module is put back after the load
    const result = await buildResolvedSchemaAst({ ...source.ast, preserveHandles: true });
    const problems = [...result.parseErrors, ...result.extendsErrors.map((error) => error.message)];
    if (problems.length || !result.resolvedAST) {
      throw new CerialGenerationError(['Schema', source.name, 'did not load:', problems.join('; ')].join(' '));
    }

    const resolvedErrors = validateResolvedTypes(result.resolvedAST);
    const concrete = { ...result.resolvedAST, models: result.resolvedAST.models.filter((m) => !m.abstract) };
    const validation = validateSchema(concrete);
    const schemaErrors = [...resolvedErrors, ...(validation.valid ? [] : validation.errors)];
    if (schemaErrors.length) {
      throw new CerialGenerationError(
        ['Schema', source.name, 'is invalid:', schemaErrors.map((error) => error.message).join('; ')].join(' '),
      );
    }

    loaded.push({ source, ast: result.resolvedAST });
  }

  // Entries on one connection merge only if their tables are disjoint, which is what generation enforces too
  const entryModels: EntryModels[] = loaded.map(({ source, ast }) => ({
    name: source.name,
    models: ast.models,
    database: source.explicitDatabase,
  }));
  validateEntryTableNames(entryModels);

  const groups = new Map<string, { connection: ResolvedMigrateConnection; entries: MigrateEntryDesired[] }>();
  for (const { source, ast } of loaded) {
    const connection = resolveMigrateConnection(flags, options.env, source.connection);
    // Credentials are left out of the key: the same database under two logins is still one database
    const key = JSON.stringify([connection.url, connection.namespace, connection.database]);
    const group = groups.get(key) ?? { connection, entries: [] };
    group.entries.push({ name: source.name, desired: desiredOf(ast) });
    groups.set(key, group);
  }

  return [...groups.values()].map(({ connection, entries: members }) => {
    const desired: SchemaModel = { tables: members.flatMap((m) => m.desired.tables), unmanaged: [] };

    return {
      connection: {
        url: connection.url,
        namespace: connection.namespace,
        database: connection.database,
        ...(connection.auth ? { username: connection.auth.username } : {}),
      },
      entries: members.map((m) => m.name),
      entryModels: members,
      desired,
      tableFingerprints: Object.fromEntries(desired.tables.map((table) => [table.name, fingerprint(table)])),
      schemaFingerprint: schemaFingerprint(desired),
      credentials: () => connection,
    };
  });
}
