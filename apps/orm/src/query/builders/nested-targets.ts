/**
 * Existence check for the records a nested `connect` or `set` links to
 *
 * A link to a record that is not there is stored without complaint (a bare id in a Record field), and
 * `include` later resolves it to nothing. The check runs before the write is built so the caller gets
 * a CerialValidationError naming the model, field and id. `disconnect` is not checked: removing a link
 * that does not exist leaves the state the caller asked for.
 */

import type { Surreal } from 'surrealdb';
import { CerialValidationError } from '../../errors';
import type { ModelMetadata, ModelRegistry } from '../../types';
import type { RecordIdInput } from '../../utils/cerial-id';
import { executeQuery } from '../executor';
import { transformOrValidateRecordId } from '../transformers';
import { isNestedConnect, isNestedSet } from './nested-builder';

/** Throws when a nested connect or set in `nestedOps` names a record that does not exist. */
export async function assertNestedTargetsExist(
  db: Surreal,
  model: ModelMetadata,
  nestedOps: Map<string, unknown>,
  registry: ModelRegistry,
  operation: string,
): Promise<void> {
  for (const [fieldName, op] of nestedOps) {
    const field = model.fields.find((f) => f.name === fieldName);
    const targetModel = field?.relationInfo ? registry[field.relationInfo.targetModel] : undefined;
    if (!targetModel) continue;

    const requested: Array<{ verb: 'connect' | 'set'; ids: RecordIdInput[] }> = [];
    if (isNestedConnect(op))
      requested.push({
        verb: 'connect',
        ids: (Array.isArray(op.connect) ? op.connect : [op.connect]) as RecordIdInput[],
      });
    if (isNestedSet(op)) requested.push({ verb: 'set', ids: op.set });

    for (const { verb, ids } of requested) {
      if (!ids.length) continue;

      const recordIds = ids.map((id) => transformOrValidateRecordId(targetModel.tableName, id));
      const rows = await executeQuery<{ id: unknown }>(db, { text: 'SELECT id FROM $ids;', vars: { ids: recordIds } });
      const found = new Set(rows.map((row) => String(row.id)));
      const missing = recordIds.find((id) => !found.has(id.toString()));
      if (!missing) continue;

      throw new CerialValidationError(
        `Field "${fieldName}" on model "${model.name}": cannot ${verb} ${targetModel.name} record "${missing.toString()}" because it does not exist`,
        { model: model.name, field: fieldName, operation },
      );
    }
  }
}
