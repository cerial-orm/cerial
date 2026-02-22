import type { SchemaFieldType } from '../../../types';

export function isGeometryType(token: string): boolean {
  return token === 'Geometry';
}

export function getGeometryFieldType(): SchemaFieldType {
  return 'geometry';
}
