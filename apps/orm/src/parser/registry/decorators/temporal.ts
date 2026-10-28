import { parseCreatedAtDecorator, parseNowDecorator, parseUpdatedAtDecorator } from '../../types/field-decorators';
import type { DecoratorEntry } from '../types';

export const temporalDecorators: readonly DecoratorEntry[] = [
  {
    name: '@now',
    constructId: 'decorator.now',
    args: { kind: 'none' },
    targets: ['modelField'],
    excludes: [
      '@createdAt',
      '@updatedAt',
      '@default',
      '@defaultAlways',
      '@readonly',
      '@nullable',
      '@uuid',
      '@uuid4',
      '@uuid7',
    ],
    description: 'A computed field that always reads as the current time. Top-level model fields only.',
    parse: (_token, range) => parseNowDecorator(range),
  },
  {
    name: '@createdAt',
    constructId: 'decorator.createdAt',
    args: { kind: 'none' },
    targets: ['modelField', 'objectField', 'tupleElement'],
    excludes: ['@now', '@updatedAt', '@default', '@defaultAlways', '@uuid', '@uuid4', '@uuid7'],
    description: 'Sets the field to the current time when the record is created. Date fields only.',
    parse: (_token, range) => parseCreatedAtDecorator(range),
  },
  {
    name: '@updatedAt',
    constructId: 'decorator.updatedAt',
    args: { kind: 'none' },
    targets: ['modelField', 'objectField', 'tupleElement'],
    excludes: ['@now', '@createdAt', '@default', '@defaultAlways', '@uuid', '@uuid4', '@uuid7'],
    description: 'Sets the field to the current time on creation and on every update. Date fields only.',
    parse: (_token, range) => parseUpdatedAtDecorator(range),
  },
];
