import { buildFieldModel } from '../../../src/migrations';
import type { FieldInput, FieldModel, IndexModel, SchemaModel, TableModel } from '../../../src/migrations';

export function field(name: string, kind: string, extra: Partial<FieldInput> = {}): FieldModel {
  return buildFieldModel({ path: name.split('.'), kind, ...extra });
}

export function index(name: string, column: string, clause = ''): IndexModel {
  return { name, columns: [[column]], index: clause };
}

export function table(name: string, fields: FieldModel[] = [], indexes: IndexModel[] = []): TableModel {
  return { name, fields, indexes };
}

export function schema(tables: TableModel[], unmanaged: SchemaModel['unmanaged'] = []): SchemaModel {
  return { tables, unmanaged };
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }

  return value;
}
