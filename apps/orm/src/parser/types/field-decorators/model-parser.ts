/**
 * Parser for @model(ModelName) decorator
 * Used on Relation types to specify the target model
 */

import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

/** Extract model name from @model(ModelName) */
export function extractModelName(token: string): string | undefined {
  const match = token.match(/^@model\((\w+)\)$/);
  return match?.[1];
}

/** Parse @model(ModelName) decorator */
export function parseModelDecorator(token: string, range: SourceRange): ASTDecorator {
  const modelName = extractModelName(token);
  return createDecorator('model', range, modelName);
}
