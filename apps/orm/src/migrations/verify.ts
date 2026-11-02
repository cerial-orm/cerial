import type { Surreal } from 'surrealdb';
import { CerialMigrationError } from '../errors';
import { diffSchema } from './diff';
import { sanitiseReason } from './comment';
import { buildMigrationPlan, indexDesiredStatements } from './plan';
import { quoteFieldPath, quoteIdent } from './quote';
import { readLiveSchema } from './reader';
import { readState } from './state';
import type { SchemaModel } from './types';

export interface VerifyInput {
  readonly schemaName: string;
  /** The desired schema as the generated client carries it. */
  readonly manifest: SchemaModel;
  /** Every generated `DEFINE` statement, flat, for the plan the refusal carries. */
  readonly statements: readonly string[];
}

/**
 * Compares the live schema with the generated one and throws `CerialMigrationError` naming each construct that differs,
 * with the plan that would converge it attached. Reads only: no `DEFINE`, no state write. Constructs Cerial does not
 * manage (events, functions, tables it never created) never refuse.
 */
export async function verifySchema(surreal: Surreal, input: VerifyInput): Promise<void> {
  const live = await readLiveSchema(surreal);
  const state = await readState(surreal, input.schemaName);
  const differences = diffSchema(input.manifest, live, { managedTables: state.schema?.managedTables ?? [] }).filter(
    (d) => d.class !== 'unmanaged',
  );
  if (!differences.length) return;

  const plan = buildMigrationPlan(differences, indexDesiredStatements(input.statements), live);
  // Message text, not query text: built by joining parts, which the interpolation ratchet reserves for SurrealQL.
  const lines = differences.map((d) => {
    const table = quoteIdent(d.table ?? '');
    const subject =
      d.construct === 'field'
        ? ['field ', quoteFieldPath(d.field ?? []), ' on table ', table].join('')
        : d.construct === 'index'
          ? ['index ', quoteIdent(d.index ?? ''), ' on table ', table].join('')
          : ['table ', table].join('');

    return sanitiseReason(['  - [', d.class, '] ', subject, ': ', d.reason].join(''));
  });

  throw new CerialMigrationError(
    [
      "The database does not match the generated schema (migrations: 'verify'); nothing was applied. ",
      "Run `cerial migrate apply` or connect once with migrations: 'auto'.\n",
      lines.join('\n'),
    ].join(''),
    { operation: 'verify', plan },
  );
}
