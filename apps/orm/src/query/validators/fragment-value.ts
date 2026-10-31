import { CerialValidationError } from '../../errors';
import type { CerialErrorOptions } from '../../errors';
import { isSqlFragment } from '../compile/sql-fragment';

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);

  return proto === Object.prototype || proto === null;
}

/**
 * Refuse a `sql` fragment anywhere inside a where value or a create or update body. A fragment is only
 * meaningful as the `$raw` where key; in a value position it would bind as an opaque object, match nothing
 * or store garbage, and never say so. The walk descends arrays and plain objects and stops at Cerial
 * wrappers, `Date` and SDK values, which are class instances.
 */
export function refuseFragmentInValue(value: unknown, path: string, context: CerialErrorOptions = {}): void {
  walk(value, path, context, new Set());
}

function walk(value: unknown, path: string, context: CerialErrorOptions, ancestors: Set<object>): void {
  if (typeof value !== 'object' || value === null) return;

  if (isSqlFragment(value)) {
    throw new CerialValidationError(
      `${path} is a fragment built by the sql tag, which is only allowed as the $raw key of a where; ` +
        'pass a plain value here',
      { ...context, field: path },
    );
  }

  const isArray = Array.isArray(value);
  if (!isArray && !isPlainObject(value)) return;
  if (ancestors.has(value)) return;

  ancestors.add(value);
  if (isArray) value.forEach((item, i) => walk(item, `${path}[${i}]`, context, ancestors));
  else for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`, context, ancestors);
  ancestors.delete(value);
}
