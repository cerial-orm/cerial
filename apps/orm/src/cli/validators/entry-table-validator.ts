import { CerialGenerationError } from '../../errors';
import type { ASTModel } from '../../types';
import { toSnakeCase } from '../../utils/string-utils';

/** One schema entry with its inheritance-resolved models */
export interface EntryModels {
  name: string;
  models: Array<Pick<ASTModel, 'name' | 'abstract'>>;
  /** Database set on the entry's own connection; undefined when unset or inherited from the root config */
  database?: string;
}

/**
 * Refuse two schema entries that resolve to the same table name.
 *
 * A shared table means two clients writing one table with different shapes. The one exception is
 * a collision where every owner configures its own `database` and all of them differ: an inherited or
 * unset database is not a deliberate separation, so it still refuses. Must run before any entry is generated: a refusal after the
 * first entry's output is on disk is not a refusal. Abstract models produce no table, so they are skipped.
 * Collisions are keyed on the resolved table name, not the model name, because `toSnakeCase` is lossy
 * (`UserAccount` and `userAccount` both give `user_account`).
 */
export function validateEntryTableNames(entries: EntryModels[]): void {
  const byTable = new Map<string, Array<{ entry: string; model: string; database?: string }>>();

  for (const { name, models, database } of entries) {
    for (const model of models) {
      if (model.abstract) continue;

      const table = toSnakeCase(model.name);
      const owners = byTable.get(table) ?? [];
      owners.push({ entry: name, model: model.name, database });
      byTable.set(table, owners);
    }
  }

  const lines: string[] = [];
  for (const [table, owners] of byTable) {
    if (new Set(owners.map((o) => o.entry)).size < 2) continue;

    const databases = owners.map((o) => o.database);
    if (databases.every(Boolean) && new Set(databases).size === databases.length) continue;

    const where = owners
      .map(
        (o) =>
          `model '${o.model}' in entry '${o.entry}' (${o.database ? `database '${o.database}'` : 'no database set on the entry'})`,
      )
      .join(', ');
    lines.push(`  - table '${table}': ${where}`);
  }

  if (!lines.length) return;

  throw new CerialGenerationError(
    `Schema entries resolve to the same table, so their clients would share it:\n${lines.join('\n')}\n` +
      'Table names follow the model name (snake_case) because no table directive exists. Rename one of the models so the tables differ, or give each entry its own database on its own connection.',
  );
}
