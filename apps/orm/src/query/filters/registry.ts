/**
 * Operator registry - maps operator keys to handlers
 */

import type { FieldMetadata } from '../../types';
import type { QueryFragment } from '../compile/types';
import type { FilterCompileContext } from '../compile/var-allocator';
// Array operators
import { handleHas, handleHasAll, handleHasAny, handleIn, handleIsEmpty, handleNotIn } from './array-operators';
// Comparison operators
import {
  handleEq,
  handleGt,
  handleGte,
  handleIsNone,
  handleLt,
  handleLte,
  handleNeq,
  handleNot,
} from './comparison-operators';
// Special operators
import { handleBetween, handleIsDefined, handleIsNotDefined, handleIsNotNull, handleIsNull } from './special-operators';
// String operators
import { handleContains, handleEndsWith, handleStartsWith } from './string-operators';

import { anyKind, arrayOnly, listable, orderable, rangeable, textual, type KindPredicate } from './operator-kinds';

/** Operator handler signature */
export type OperatorHandler = (
  ctx: FilterCompileContext,
  field: string,
  value: unknown,
  fieldMetadata: FieldMetadata,
) => QueryFragment;

/**
 * What an operator's operand is, which decides how it is split into single values before each is checked
 * and converted as create does:
 * - `value`: the whole field value (the whole array on an array field)
 * - `element`: one element of an array field
 * - `valueList`: a list of whole values (in, notIn)
 * - `elementList`: a list of elements (hasAll, hasAny)
 * - `pair`: a minimum and a maximum (between)
 * - `text`: a string used as given, partial values included
 * - `flag`: a boolean
 */
export type OperandShape = 'value' | 'element' | 'valueList' | 'elementList' | 'pair' | 'text' | 'flag';

export interface OperatorEntry {
  readonly handler: OperatorHandler;
  readonly operand: OperandShape;
  /** True when the field kind takes the operator */
  readonly kinds: KindPredicate;
}

/** Registry of all operators */
const operatorRegistry: Record<string, OperatorEntry> = {
  // Comparison operators
  eq: { handler: handleEq, operand: 'value', kinds: anyKind },
  neq: { handler: handleNeq, operand: 'value', kinds: anyKind },
  not: { handler: handleNot, operand: 'value', kinds: anyKind },
  gt: { handler: handleGt, operand: 'value', kinds: orderable },
  gte: { handler: handleGte, operand: 'value', kinds: orderable },
  lt: { handler: handleLt, operand: 'value', kinds: orderable },
  lte: { handler: handleLte, operand: 'value', kinds: orderable },

  // String operators
  contains: { handler: handleContains as OperatorHandler, operand: 'text', kinds: textual },
  startsWith: { handler: handleStartsWith as OperatorHandler, operand: 'text', kinds: textual },
  endsWith: { handler: handleEndsWith as OperatorHandler, operand: 'text', kinds: textual },

  // Array operators (value in array of possible values)
  in: { handler: handleIn as OperatorHandler, operand: 'valueList', kinds: listable },
  notIn: { handler: handleNotIn as OperatorHandler, operand: 'valueList', kinds: listable },

  // Array field operators (check array field contents)
  has: { handler: handleHas as OperatorHandler, operand: 'element', kinds: arrayOnly },
  hasAll: { handler: handleHasAll as OperatorHandler, operand: 'elementList', kinds: arrayOnly },
  hasAny: { handler: handleHasAny as OperatorHandler, operand: 'elementList', kinds: arrayOnly },
  isEmpty: { handler: handleIsEmpty as OperatorHandler, operand: 'flag', kinds: arrayOnly },

  // Special operators
  isNull: {
    handler: (_ctx, field, value, _meta) => {
      if (value === true) return handleIsNull(field);

      return handleIsNotNull(field);
    },
    operand: 'flag',
    kinds: anyKind,
  },
  isDefined: {
    handler: (_ctx, field, value, _meta) => {
      if (value === true) return handleIsDefined(field);

      return handleIsNotDefined(field);
    },
    operand: 'flag',
    kinds: anyKind,
  },
  between: { handler: handleBetween as OperatorHandler, operand: 'pair', kinds: rangeable },

  // NONE vs null operators (SurrealDB specific)
  // isNone: true → field is absent (NONE)
  // isNone: false → field is present (could be null or have a value)
  isNone: { handler: handleIsNone as OperatorHandler, operand: 'flag', kinds: anyKind },
};

/** Get an operator's registry entry by name */
export function getOperatorEntry(operator: string): OperatorEntry | undefined {
  return Object.hasOwn(operatorRegistry, operator) ? operatorRegistry[operator] : undefined;
}

/** Get an operator handler by name */
export function getOperatorHandler(operator: string): OperatorHandler | undefined {
  return getOperatorEntry(operator)?.handler;
}

/** Check if an operator is registered */
export function isRegisteredOperator(operator: string): boolean {
  return Object.hasOwn(operatorRegistry, operator);
}

/** Get all registered operator names */
export function getRegisteredOperators(): string[] {
  return Object.keys(operatorRegistry);
}

/** Register a custom operator */
export function registerOperator(
  name: string,
  handler: OperatorHandler,
  operand: OperandShape = 'value',
  kinds: KindPredicate = anyKind,
): void {
  operatorRegistry[name] = { handler, operand, kinds };
}
