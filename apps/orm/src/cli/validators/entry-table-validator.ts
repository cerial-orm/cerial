import { CerialGenerationError } from '../../errors';
import type { ASTModel } from '../../types';
import { toSnakeCase } from '../../utils/string-utils';

/** One schema entry with its inheritance-resolved models */
export interface EntryModels {
  name: string;
  models: Array<Pick<ASTModel, 'name' | 'abstract'>>;
}

/**
 * Refuse two schema entries that resolve to the same table name.
 *
 * Every entry is generated against the same database by default, so a shared table means two clients
 * writing one table with different shapes. Must run before any entry is generated: a refusal after the
 * first entry's output is on disk is not a refusal. Abstract models produce no table, so they are skipped.
 * Collisions are keyed on the resolved table name, not the model name, because `toSnakeCase` is lossy
 * (`UserAccount` and `userAccount` both give `user_account`).
 */
export function validateEntryTableNames(entries: EntryModels[]): void {
  const byTable = new Map<string, Array<{ entry: string; model: string }>>();

  for (const { name, models } of entries) {
    for (const model of models) {
      if (model.abstract) continue;

      const table = toSnakeCase(model.name);
      const owners = byTable.get(table) ?? [];
      owners.push({ entry: name, model: model.name });
      byTable.set(table, owners);
    }
  }

  const lines: string[] = [];
  for (const [table, owners] of byTable) {
    if (new Set(owners.map((o) => o.entry)).size < 2) continue;

    const where = owners.map((o) => `model '${o.model}' in entry '${o.entry}'`).join(', ');
    lines.push(`  - table '${table}': ${where}`);
  }

  if (!lines.length) return;

  throw new CerialGenerationError(
    `Schema entries resolve to the same table, so their clients would share it:\n${lines.join('\n')}\n` +
      'Table names follow the model name (snake_case) because no table directive exists. Rename one of the models so the tables differ.',
  );
}
