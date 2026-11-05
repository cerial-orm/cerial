import type { ModelMetadata, ModelRegistry } from '../../types';
import { isObject } from '../../utils/type-utils';
import { validationFailure } from './failure';
import { validateCompute, validateOrderBy, validatePagination, validateSelect } from './select-validator';

/**
 * Options a find method's type omits. The builders would read them anyway (findOne forces its own limit
 * but still honours an offset; findUnique validates an orderBy it never emits), so a JavaScript or
 * dynamic caller is told rather than silently ignored.
 */
const UNSUPPORTED_READ_OPTIONS: Record<string, readonly ('orderBy' | 'limit' | 'offset')[]> = {
  findOne: ['limit', 'offset'],
  findUnique: ['orderBy', 'limit', 'offset'],
};

/** Throw on select/orderBy/limit/offset values the model cannot honour, so a typo is not silently dropped. */
export function assertValidReadOptions(
  model: ModelMetadata,
  operation: string,
  options: { select?: object; orderBy?: object; limit?: number; offset?: number; compute?: unknown },
  registry?: ModelRegistry,
): void {
  for (const option of UNSUPPORTED_READ_OPTIONS[operation] ?? []) {
    if (options[option] === undefined) continue;

    throw validationFailure(
      option,
      [{ message: `${operation} does not accept ${option}`, field: option }],
      model,
      operation,
    );
  }

  const checks = [
    ['select', validateSelect(options.select, model)],
    ['compute', validateCompute(options.compute, model)],
    [
      'orderBy',
      validateOrderBy(
        options.orderBy,
        model,
        registry,
        isObject(options.compute) ? Object.keys(options.compute) : undefined,
      ),
    ],
    ['limit/offset', validatePagination(options.limit, options.offset)],
  ] as const;

  for (const [context, errors] of checks) {
    if (errors.length) throw validationFailure(context, errors, model, operation);
  }
}
