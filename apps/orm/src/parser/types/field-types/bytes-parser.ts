import type { SchemaFieldType } from '../../../types';

export function isBytesType(token: string): boolean {
  return token === 'Bytes';
}

export function getBytesFieldType(): SchemaFieldType {
  return 'bytes';
}
