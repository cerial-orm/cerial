import type { SchemaFieldType } from '../../../types';

export function isDecimalType(token: string): boolean {
  return token === 'Decimal';
}

export function getDecimalFieldType(): SchemaFieldType {
  return 'decimal';
}
