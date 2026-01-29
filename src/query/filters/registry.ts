/**
 * Operator registry - maps operator keys to handlers
 */

import type { FieldMetadata } from '../../types';
import type { QueryFragment } from '../compile/types';
import type { FilterCompileContext } from '../compile/var-allocator';

// Comparison operators
import { handleEq, handleGt, handleGte, handleLt, handleLte, handleNeq } from './comparison-operators';

// String operators
import { handleContains, handleEndsWith, handleStartsWith } from './string-operators';

// Array operators
import { handleHas, handleHasAll, handleHasAny, handleIn, handleIsEmpty, handleNotIn } from './array-operators';

// Special operators
import { handleBetween, handleIsDefined, handleIsNull } from './special-operators';

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

  // Array operators (value in array of possible values)
  in: handleIn as OperatorHandler,
  notIn: handleNotIn as OperatorHandler,

  // Array field operators (check array field contents)
  has: handleHas as OperatorHandler,
  hasAll: handleHasAll as OperatorHandler,
  hasAny: handleHasAny as OperatorHandler,
  isEmpty: handleIsEmpty as OperatorHandler,

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
