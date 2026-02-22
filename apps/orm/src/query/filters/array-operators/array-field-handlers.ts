/**
 * Array field operators - has, hasAll, hasAny, isEmpty
 * These operators work on array-type fields (e.g., String[], Int[], Record[])
 */

import type { FieldMetadata } from '../../../types';
import type { QueryFragment } from '../../compile/types';
import type { FilterCompileContext } from '../../compile/var-allocator';

/** Handle has operator - checks if array contains a single value */
export function handleHas(
  ctx: FilterCompileContext,
  field: string,
  value: unknown,
  fieldMetadata: FieldMetadata,
): QueryFragment {
  const v = ctx.bind(field, 'has', value, fieldMetadata.type);
  return { text: `${field} CONTAINS ${v.placeholder}`, vars: v.vars };
}

/** Handle hasAll operator - checks if array contains all values */
export function handleHasAll(
  ctx: FilterCompileContext,
  field: string,
  values: unknown[],
  fieldMetadata: FieldMetadata,
): QueryFragment {
  const v = ctx.bind(field, 'hasAll', values, fieldMetadata.type);
  return { text: `${field} CONTAINSALL ${v.placeholder}`, vars: v.vars };
}

/** Handle hasAny operator - checks if array contains any of the values */
export function handleHasAny(
  ctx: FilterCompileContext,
  field: string,
  values: unknown[],
  fieldMetadata: FieldMetadata,
): QueryFragment {
  const v = ctx.bind(field, 'hasAny', values, fieldMetadata.type);
  return { text: `${field} CONTAINSANY ${v.placeholder}`, vars: v.vars };
}

/** Handle isEmpty operator - checks if array is empty */
export function handleIsEmpty(
  _ctx: FilterCompileContext,
  field: string,
  isEmpty: boolean,
  _fieldMetadata: FieldMetadata,
): QueryFragment {
  if (isEmpty) {
    return { text: `array::len(${field}) = 0`, vars: {} };
  }
  return { text: `array::len(${field}) > 0`, vars: {} };
}
