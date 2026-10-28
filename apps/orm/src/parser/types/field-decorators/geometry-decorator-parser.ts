import type { ASTDecorator, SchemaDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

export function parseGeometryDecorator(token: string, range: SourceRange): ASTDecorator {
  const decoratorType = token.slice(1) as SchemaDecorator;

  return createDecorator(decoratorType, range);
}
