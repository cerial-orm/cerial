import type { SchemaFieldType } from '../../../types';

export function isAnyType(token: string): boolean {
  return token === 'Any';
}

export function getAnyFieldType(): SchemaFieldType {
  return 'any';
}
