import type { SchemaFieldType } from '../../../types';

export function isUuidType(token: string): boolean {
  return token === 'Uuid';
}

export function getUuidFieldType(): SchemaFieldType {
  return 'uuid';
}
