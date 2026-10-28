import { parseDistinctDecorator, parseSetDecorator, parseSortDecorator } from '../../types/field-decorators';
import type { DecoratorEntry } from '../types';

export const arrayDecorators: readonly DecoratorEntry[] = [
  {
    name: '@distinct',
    constructId: 'decorator.distinct',
    args: { kind: 'none' },
    targets: ['modelField', 'objectField'],
    excludes: ['@set'],
    description: 'Removes duplicate values from an array field. Array fields only.',
    parse: (_token, range) => parseDistinctDecorator(range),
  },
  {
    name: '@set',
    constructId: 'decorator.set',
    args: { kind: 'none' },
    targets: ['modelField', 'objectField'],
    excludes: ['@distinct', '@sort'],
    description: 'Stores a primitive array as a SurrealDB set: unique and ordered by the database.',
    parse: (_token, range) => parseSetDecorator(range),
  },
  {
    name: '@sort',
    constructId: 'decorator.sort',
    args: { kind: 'choice', choices: ['asc', 'desc', 'true', 'false'], optional: true },
    targets: ['modelField', 'objectField'],
    excludes: ['@set'],
    description: 'Keeps an array field sorted: ascending by default, or @sort(desc) for descending. Array fields only.',
    parse: parseSortDecorator,
  },
];
