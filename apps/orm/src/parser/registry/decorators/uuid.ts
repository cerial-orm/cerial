import { parseUuid4Decorator, parseUuid7Decorator, parseUuidDecorator } from '../../types/field-decorators';
import type { DecoratorEntry } from '../types';

const UUID_EXCLUDES = ['@default', '@defaultAlways', '@now', '@createdAt', '@updatedAt'] as const;

export const uuidDecorators: readonly DecoratorEntry[] = [
  {
    name: '@uuid',
    args: { kind: 'none' },
    targets: ['modelField', 'objectField'],
    excludes: ['@uuid4', '@uuid7', ...UUID_EXCLUDES],
    description: 'Generates a UUID for the field on create. Uuid fields only.',
    parse: parseUuidDecorator,
  },
  {
    name: '@uuid4',
    args: { kind: 'none' },
    targets: ['modelField', 'objectField'],
    excludes: ['@uuid', '@uuid7', ...UUID_EXCLUDES],
    description: 'Generates a random (version 4) UUID for the field on create. Uuid fields only.',
    parse: parseUuid4Decorator,
  },
  {
    name: '@uuid7',
    args: { kind: 'none' },
    targets: ['modelField', 'objectField'],
    excludes: ['@uuid', '@uuid4', ...UUID_EXCLUDES],
    description: 'Generates a time-ordered (version 7) UUID for the field on create. Uuid fields only.',
    parse: parseUuid7Decorator,
  },
];
