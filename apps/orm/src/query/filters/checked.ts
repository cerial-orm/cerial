/**
 * The operator handlers the package exports. They splice `field` into query text, and the where builders
 * hand them a path they have already resolved against the model (flexible sub-keys arrive quoted). A caller
 * that skips the builders could pass anything, so the public versions accept only a plain identifier or a
 * dotted path of identifiers. The builders and the registry keep using the unchecked handlers.
 */
import { CerialValidationError } from '../../errors';
import type { QueryFragment } from '../compile/types';
import { handleIn, handleNotIn } from './array-operators';
import { handleEq, handleGt, handleGte, handleLt, handleLte, handleNeq } from './comparison-operators';
import { getOperatorHandler as getUncheckedOperatorHandler, type OperatorHandler } from './registry';
import { handleBetween, handleIsDefined, handleIsNotDefined, handleIsNotNull, handleIsNull } from './special-operators';
import { handleContains, handleEndsWith, handleStartsWith } from './string-operators';

const FIELD_PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

function assertFieldPath(field: unknown): void {
  if (typeof field === 'string' && FIELD_PATH.test(field)) return;

  throw new CerialValidationError(
    `Invalid field ${JSON.stringify(field)}: a filter field must be an identifier or a dotted path of identifiers`,
    { field: String(field) },
  );
}

/** `at` is the position of the field argument */
function guardField<F extends (...args: never[]) => QueryFragment>(handler: F, at: number): F {
  return ((...args: unknown[]) => {
    assertFieldPath(args[at]);

    return (handler as unknown as (...a: unknown[]) => QueryFragment)(...args);
  }) as unknown as F;
}

export const handleEqChecked = guardField(handleEq, 1);
export const handleNeqChecked = guardField(handleNeq, 1);
export const handleGtChecked = guardField(handleGt, 1);
export const handleGteChecked = guardField(handleGte, 1);
export const handleLtChecked = guardField(handleLt, 1);
export const handleLteChecked = guardField(handleLte, 1);
export const handleInChecked = guardField(handleIn, 1);
export const handleNotInChecked = guardField(handleNotIn, 1);
export const handleBetweenChecked = guardField(handleBetween, 1);
export const handleContainsChecked = guardField(handleContains, 1);
export const handleStartsWithChecked = guardField(handleStartsWith, 1);
export const handleEndsWithChecked = guardField(handleEndsWith, 1);
export const handleIsNullChecked = guardField(handleIsNull, 0);
export const handleIsNotNullChecked = guardField(handleIsNotNull, 0);
export const handleIsDefinedChecked = guardField(handleIsDefined, 0);
export const handleIsNotDefinedChecked = guardField(handleIsNotDefined, 0);

/** The registry hands out the raw handlers, so the public lookup wraps what it returns */
export function getOperatorHandlerChecked(operator: string): OperatorHandler | undefined {
  const handler = getUncheckedOperatorHandler(operator);

  return handler && guardField(handler, 1);
}
