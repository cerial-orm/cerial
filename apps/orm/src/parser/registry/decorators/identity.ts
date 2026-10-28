import { parseIdDecorator, parseIndexDecorator, parseUniqueDecorator } from '../../types/field-decorators';
import type { DecoratorEntry } from '../types';

export const identityDecorators: readonly DecoratorEntry[] = [
  {
    name: '@id',
    args: { kind: 'none' },
    targets: ['modelField'],
    excludes: ['@nullable', '@readonly'],
    description:
      "Marks a field as the model's primary record identifier. Every model needs exactly one, on a Record field.",
    parse: (_token, range) => parseIdDecorator(range),
  },
  {
    name: '@unique',
    args: { kind: 'none' },
    targets: ['modelField', 'objectField'],
    excludes: ['@index'],
    description:
      'Creates a unique index on the field, so no two records can share its value. Not allowed on array fields.',
    parse: (_token, range) => parseUniqueDecorator(range),
  },
  {
    name: '@index',
    args: { kind: 'none' },
    targets: ['modelField', 'objectField'],
    excludes: ['@unique'],
    description: 'Creates a non-unique index on the field to speed up filtering and sorting.',
    parse: (_token, range) => parseIndexDecorator(range),
  },
];
