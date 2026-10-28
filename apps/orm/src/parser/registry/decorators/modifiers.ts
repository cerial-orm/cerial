import { parseFlexibleDecorator, parseNullableDecorator, parseReadonlyDecorator } from '../../types/field-decorators';
import type { DecoratorEntry } from '../types';

export const modifierDecorators: readonly DecoratorEntry[] = [
  {
    name: '@nullable',
    constructId: 'decorator.nullable',
    args: { kind: 'none' },
    targets: ['modelField', 'objectField', 'tupleElement'],
    excludes: ['@id', '@now'],
    description:
      'Lets the field hold an explicit null, separate from being absent. Not allowed on object, tuple, relation or Any fields.',
    parse: (_token, range) => parseNullableDecorator(range),
  },
  {
    name: '@readonly',
    constructId: 'decorator.readonly',
    args: { kind: 'none' },
    targets: ['modelField', 'objectField'],
    excludes: ['@id', '@now', '@defaultAlways'],
    description:
      'Makes the field write-once: settable on create, excluded from updates. Not allowed on Relation fields.',
    parse: (_token, range) => parseReadonlyDecorator(range),
  },
  {
    name: '@flexible',
    constructId: 'decorator.flexible',
    args: { kind: 'none' },
    targets: ['modelField', 'objectField'],
    excludes: [],
    description: 'Lets an object field store extra properties beyond its declared ones. Object-typed fields only.',
    parse: (_token, range) => parseFlexibleDecorator(range),
  },
];
