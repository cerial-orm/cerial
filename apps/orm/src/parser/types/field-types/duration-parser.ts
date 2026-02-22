import type { SchemaFieldType } from '../../../types';

export function isDurationType(token: string): boolean {
  return token === 'Duration';
}

export function getDurationFieldType(): SchemaFieldType {
  return 'duration';
}
