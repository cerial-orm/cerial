import type { ASTDecorator, SchemaDecorator, SourceRange } from '../../../types';
import { createDecorator } from '../ast';

const GEOMETRY_DECORATORS = [
  '@point',
  '@line',
  '@polygon',
  '@multipoint',
  '@multiline',
  '@multipolygon',
  '@geoCollection',
];

export function isGeometryDecorator(token: string): boolean {
  return GEOMETRY_DECORATORS.includes(token);
}

export function parseGeometryDecorator(token: string, range: SourceRange): ASTDecorator {
  const decoratorType = token.slice(1) as SchemaDecorator;

  return createDecorator(decoratorType, range);
}
