import type { ASTDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

export function isUuidDecorator(token: string): boolean {
  return token === '@uuid';
}

export function isUuid4Decorator(token: string): boolean {
  return token === '@uuid4';
}

export function isUuid7Decorator(token: string): boolean {
  return token === '@uuid7';
}

export function parseUuidDecorator(token: string, range: SourceRange): ASTDecorator {
  return createDecorator('uuid', range);
}

export function parseUuid4Decorator(token: string, range: SourceRange): ASTDecorator {
  return createDecorator('uuid4', range);
}

export function parseUuid7Decorator(token: string, range: SourceRange): ASTDecorator {
  return createDecorator('uuid7', range);
}
