/**
 * Between operator handler
 */

import type { QueryFragment } from '../../compile/types';
import type { FilterCompileContext } from '../../compile/var-allocator';
import type { FieldMetadata } from '../../../types';

/** Handle between operator */
export function handleBetween(
  ctx: FilterCompileContext,
  field: string,
  range: [unknown, unknown],
  fieldMetadata: FieldMetadata,
): QueryFragment {
  const [min, max] = range;
  const minVar = ctx.bind(field, 'between_min', min, fieldMetadata.type);
  const maxVar = ctx.bind(field, 'between_max', max, fieldMetadata.type);

  return {
    text: `${field} >= ${minVar.placeholder} AND ${field} <= ${maxVar.placeholder}`,
    vars: { ...minVar.vars, ...maxVar.vars },
  };
}
