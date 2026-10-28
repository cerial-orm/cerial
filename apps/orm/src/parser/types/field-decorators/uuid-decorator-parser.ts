import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

export function parseUuidDecorator(_token: string, range: SourceRange): ASTDecorator {
  return createDecorator('uuid', range);
}

export function parseUuid4Decorator(_token: string, range: SourceRange): ASTDecorator {
  return createDecorator('uuid4', range);
}

export function parseUuid7Decorator(_token: string, range: SourceRange): ASTDecorator {
  return createDecorator('uuid7', range);
}
