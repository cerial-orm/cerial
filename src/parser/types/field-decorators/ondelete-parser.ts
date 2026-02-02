/**
 * Parser for @onDelete(Action) decorator
 * Used on optional Relation types to specify delete behavior
 * Valid actions: Cascade, SetNull, Restrict, NoAction
 */

import type { ASTDecorator, OnDeleteAction, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Valid onDelete actions */
const VALID_ACTIONS: OnDeleteAction[] = ['Cascade', 'SetNull', 'Restrict', 'NoAction'];

/** Check if a token is the @onDelete decorator */
export function isOnDeleteDecorator(token: string): boolean {
  return token.startsWith('@onDelete(');
}

/** Extract action from @onDelete(Action) */
export function extractOnDeleteAction(token: string): OnDeleteAction | undefined {
  const match = token.match(/^@onDelete\((\w+)\)$/);
  const action = match?.[1];

  if (action && VALID_ACTIONS.includes(action as OnDeleteAction)) {
    return action as OnDeleteAction;
  }

  return undefined;
}

/** Check if an action is a valid onDelete action */
export function isValidOnDeleteAction(action: string): action is OnDeleteAction {
  return VALID_ACTIONS.includes(action as OnDeleteAction);
}

/** Parse @onDelete(Action) decorator */
export function parseOnDeleteDecorator(token: string, range: SourceRange): ASTDecorator {
  const action = extractOnDeleteAction(token);

  return createDecorator('onDelete', range, action);
}
