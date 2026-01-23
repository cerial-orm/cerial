/**
 * Operator registry - maps operator keys to handlers
 */

import type { QueryFragment } from '../compile/types';
import type { FilterCompileContext } from '../compile/var-allocator';
import type { FieldMetadata } from '../../types';

// Comparison operators
import { handleEq, handleNeq, handleGt, handleGte, handleLt, handleLte } from './comparison-operators';

// String operators
import { handleContains, handleStartsWith, handleEndsWith } from './string-operators';

// Array operators
import { handleIn, handleNotIn } from './array-operators';

// Special operators
import { handleIsNull, handleIsDefined, handleBetween } from './special-operators';

/** Operator handler signature */
export type OperatorHandler = (
  ctx: FilterCompileContext,
  field: string,
  value: unknown,
  fieldMetadata: FieldMetadata,
) => QueryFragment;

/** Registry of all operators */
const operatorRegistry: Record<string, OperatorHandler> = {
  // Comparison operators
  eq: handleEq,
  neq: handleNeq,
  gt: handleGt,
  gte: handleGte,
  lt: handleLt,
  lte: handleLte,

  // String operators
  contains: handleContains as OperatorHandler,
  startsWith: handleStartsWith as OperatorHandler,
  endsWith: handleEndsWith as OperatorHandler,

  // Array operators
  in: handleIn as OperatorHandler,
  notIn: handleNotIn as OperatorHandler,

  // Special operators
  isNull: (ctx, field, value, _meta) => {
    if (value === true) return handleIsNull(field);
    return handleIsDefined(field);
  },
  isDefined: (ctx, field, value, _meta) => {
    if (value === true) return handleIsDefined(field);
    return handleIsNull(field);
  },
  between: handleBetween as OperatorHandler,
};

/** Get an operator handler by name */
export function getOperatorHandler(operator: string): OperatorHandler | undefined {
  return operatorRegistry[operator];
}

/** Check if an operator is registered */
export function isRegisteredOperator(operator: string): boolean {
  return operator in operatorRegistry;
}

/** Get all registered operator names */
export function getRegisteredOperators(): string[] {
  return Object.keys(operatorRegistry);
}

/** Register a custom operator */
export function registerOperator(name: string, handler: OperatorHandler): void {
  operatorRegistry[name] = handler;
}
